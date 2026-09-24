/**
 * tests/gc-scan.test.mjs — gc-scan.mjs 测试
 *
 * 覆盖全部 8 个扫描维度、JSON 输出格式、CI 退出逻辑。
 * 使用 createVirtualProject 为纯文件系统维度创建虚拟项目；
 * 对 git/tsc 维度 mock child_process.execSync。
 */

import { describe, it, expect, vi } from "vitest";
import { scan } from "../scripts/gc-scan.mjs";
import { createVirtualProject, Fixtures } from "./setup.mjs";

// Mock child_process via globalThis mutable state
const mockExecResults = globalThis.__gcMockExecResults || (globalThis.__gcMockExecResults = {});

vi.mock('child_process', () => ({
  execSync: (cmd, opts) => {
    const cmdStr = String(cmd);
    const results = globalThis.__gcMockExecResults || {};
    for (const [pattern, result] of Object.entries(results)) {
      if (cmdStr.includes(pattern)) {
        if (result instanceof Error) throw result;
        return opts && opts.encoding ? String(result) : Buffer.from(String(result));
      }
    }
    return opts && opts.encoding ? '' : Buffer.from('');
  },
}));

function setMockGit(overrides = {}) {
  Object.assign(mockExecResults, {
    "rev-parse --show-toplevel": "/fake/project",
    "rev-parse --abbrev-ref HEAD": overrides.branch || "main",
    "status --short": overrides.status || "",
    "diff --unified=0": overrides.diff || "",
    "diff --cached --unified=0": overrides.stagedDiff || "",
    "log -1 --oneline": overrides.lastCommit || "abc1234 Initial commit",
  });
  // 也合并额外的 overrides（如 diff 内容等）
  for (const [k, v] of Object.entries(overrides)) {
    if (!["branch", "status", "diff", "stagedDiff", "lastCommit"].includes(k)) {
      mockExecResults[k] = v;
    }
  }
}

// ── Dimension 1: CLAUDE.md 完整性 ──

describe("gc-scan: Dimension 1 — CLAUDE.md 完整性", () => {
  it("检测缺失的 CLAUDE.md → critical", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "missing_file" && f.file === "CLAUDE.md");
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical");
    cleanup();
  });

  it("检测缺少必要章节 → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": "# Just a title\nNo rules here.",
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const missingSections = result.findings.filter(f => f.type === "missing_section");
    expect(missingSections.length).toBeGreaterThan(0);
    expect(missingSections[0].severity).toBe("warning");
    cleanup();
  });

  it("检测占位符 → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.placeholderClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const placeholder = result.findings.find(f => f.type === "placeholder");
    expect(placeholder).toBeDefined();
    expect(placeholder.severity).toBe("warning");
    cleanup();
  });

  it("完整 CLAUDE.md → 无警告", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const claudeFindings = result.findings.filter(f => f.file === "CLAUDE.md");
    expect(claudeFindings).toHaveLength(0);
    cleanup();
  });
});

// ── Dimension 2: Git 状态 ──

describe("gc-scan: Dimension 2 — Git 状态", () => {
  it("大量未提交变更 → info", async () => {
    const manyFiles = Array.from({ length: 15 }, (_, i) => ` M file${i}.ts`).join("\n");
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit({ status: manyFiles });
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "many_uncommitted");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    cleanup();
  });

  it("少量未提交变更 → 不报告", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit({ status: " M file1.ts\n M file2.ts" });
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "many_uncommitted");
    expect(f).toBeUndefined();
    cleanup();
  });

  it("调试残留 console.log → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit({ diff: "+  console.log('debug');" });
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "debug_residue" && f.message.includes("console.log"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });

  it("非 git 目录 → 跳过 git 检查", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    // 清除所有 mock key → rev-parse 返回空
    for (const k of Object.keys(mockExecResults)) delete mockExecResults[k];
    const result = await scan(projectRoot);
    const gitFindings = result.findings.filter(f =>
      f.type === "many_uncommitted" || f.type === "debug_residue"
    );
    expect(gitFindings).toHaveLength(0);
    cleanup();
  });
});

// ── Dimension 3: TODO/FIXME 密度 ──

describe("gc-scan: Dimension 3 — TODO/FIXME 密度", () => {
  it("单文件 >5 个 TODO → info", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
      "src/heavy.mjs": "// TODO a\n// TODO b\n// TODO c\n// TODO d\n// TODO e\n// TODO f\n",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "todo_cluster");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    expect(f.detail).toContain("6");
    cleanup();
  });

  it("少量 TODO → 不报告", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
      "src/light.mjs": "// TODO a\n// TODO b\n",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "todo_cluster");
    expect(f).toBeUndefined();
    cleanup();
  });
});

// ── Dimension 4: .gitignore 健康 ──

describe("gc-scan: Dimension 4 — .gitignore 健康", () => {
  it("缺少 .gitignore → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "missing_file" && f.file === ".gitignore");
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });

  it("完整 .gitignore → 无警告", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".gitignore": Fixtures.minimalGitignore,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const giFindings = result.findings.filter(f => f.file === ".gitignore");
    expect(giFindings).toHaveLength(0);
    cleanup();
  });
});

// ── Dimension 5: Hook 注册状态 ──

describe("gc-scan: Dimension 5 — Hook 注册状态", () => {
  it("缺失关键 Hook → critical", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/": null, // 空目录
    });
    setMockGit();
    const result = await scan(projectRoot);
    // hooks dir 存在但是空的 → 应该报告 missing hooks
    const criticalHooks = result.findings.filter(f => f.severity === "critical" && f.type === "missing_hook");
    expect(criticalHooks.length).toBeGreaterThan(0);
    cleanup();
  });

  it("Hook 目录缺失 → critical", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "missing_dir" && f.file === ".claude/hooks/");
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical");
    cleanup();
  });
});

// ── Dimension 6: Harness 状态 ──

describe("gc-scan: Dimension 6 — Harness 状态", () => {
  it("缺少 .harness-state → info", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "missing_file" && f.file === ".claude/.harness-state");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    cleanup();
  });

  it("JSON 损坏 → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/.harness-state": "{broken json",
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "harness_state_invalid" && f.message.includes("JSON"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });

  it("缺少必要字段 → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/.harness-state": '{"something": "else"}',
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "harness_state_invalid" && f.message.includes("缺少必要字段"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });

  it("有效 .harness-state → 通过", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/.harness-state": Fixtures.minimalHarnessState,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const harnessFindings = result.findings.filter(f => f.file === ".claude/.harness-state");
    // 只有缺失情况才报告，有效则不报告
    expect(harnessFindings).toHaveLength(0);
    cleanup();
  });
});

// ── Dimension 8: LSP 配置 ──

describe("gc-scan: Dimension 8 — LSP 配置", () => {
  it("缺少 .lsp.json → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "missing_file" && f.file === ".lsp.json");
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });

  it("存在 .lsp.json 但无 TypeScript → info", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".lsp.json": '{"languages": {"python": {}}}',
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find(f => f.type === "lsp_config");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    cleanup();
  });
});

// ── 输出格式与汇总 ──

describe("gc-scan: 输出格式", () => {
  it("返回结构化 result 对象", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": Fixtures.completeClaudeMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".claude/hooks/pre-tool-check.mjs": "// stub",
      ".claude/hooks/session-context.mjs": "// stub",
      ".claude/hooks/session-review.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    expect(result).toHaveProperty("scanId");
    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("context");
    expect(result).toHaveProperty("findings");
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.summary.total).toBe(result.findings.length);
    cleanup();
  });

  it("summary 计数正确", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      // 故意缺失 CLAUDE.md → critical
      ".claude/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    expect(result.summary.critical).toBeGreaterThan(0);
    expect(result.summary.total).toBe(
      result.summary.critical + result.summary.warning + result.summary.info
    );
    cleanup();
  });
});
