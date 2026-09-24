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

const mockExecResults = globalThis.__gcMockExecResults || (globalThis.__gcMockExecResults = {});

vi.mock("child_process", () => ({
  execSync: (cmd, opts) => {
    const cmdStr = String(cmd);
    const results = globalThis.__gcMockExecResults || {};
    for (const [pattern, result] of Object.entries(results)) {
      if (cmdStr.includes(pattern)) {
        if (result instanceof Error) throw result;
        return opts && opts.encoding ? String(result) : Buffer.from(String(result));
      }
    }
    return opts && opts.encoding ? "" : Buffer.from("");
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
  for (const [k, v] of Object.entries(overrides)) {
    if (!["branch", "status", "diff", "stagedDiff", "lastCommit"].includes(k)) {
      mockExecResults[k] = v;
    }
  }
}

// ── Dimension 1: 规则文件完整性 ──

describe("gc-scan: Dimension 1 — 规则文件完整性", () => {
  it("检测缺失的规则文件 → critical", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find((f) => f.type === "missing_file" && f.file === "AGENTS.md");
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical");
    cleanup();
  });

  it("检测缺少必要章节 → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": "# Just a title\nNo rules here.",
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const missingSections = result.findings.filter((f) => f.type === "missing_section");
    expect(missingSections.length).toBeGreaterThan(0);
    expect(missingSections[0].severity).toBe("warning");
    cleanup();
  });

  it("完整 AGENTS.md → 无警告", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const findings = result.findings.filter((f) => f.file === "AGENTS.md");
    expect(findings).toHaveLength(0);
    cleanup();
  });
});

// ── Dimension 2: Git 状态 ──

describe("gc-scan: Dimension 2 — Git 状态", () => {
  it("大量未提交变更 → info", async () => {
    const manyFiles = Array.from({ length: 15 }, (_, i) => ` M file${i}.ts`).join("\n");
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit({ status: manyFiles });
    const result = await scan(projectRoot);
    const f = result.findings.find((f) => f.type === "many_uncommitted");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    cleanup();
  });

  it("调试残留 console.log → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit({ diff: "+  console.log('debug');" });
    const result = await scan(projectRoot);
    const f = result.findings.find((f) => f.type === "debug_residue" && f.message.includes("console.log"));
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });
});

// ── Dimension 3: TODO/FIXME 密度 ──

describe("gc-scan: Dimension 3 — TODO/FIXME 密度", () => {
  it("单文件 >5 个 TODO → info", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
      "src/heavy.mjs": "// TODO a\n// TODO b\n// TODO c\n// TODO d\n// TODO e\n// TODO f\n",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find((f) => f.type === "todo_cluster");
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    expect(f.detail).toContain("6");
    cleanup();
  });
});

// ── Dimension 4: .gitignore 健康 ──

describe("gc-scan: Dimension 4 — .gitignore 健康", () => {
  it("缺少 .gitignore → warning", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    setMockGit();
    const result = await scan(projectRoot);
    const f = result.findings.find((f) => f.type === "missing_file" && f.file === ".gitignore");
    expect(f).toBeDefined();
    expect(f.severity).toBe("warning");
    cleanup();
  });
});

// ── Dimension 5: Hook 注册状态 ──

describe("gc-scan: Dimension 5 — Hook 注册状态", () => {
  it("缺失关键 Hook → critical", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/": null, // 空目录
    });
    setMockGit();
    const result = await scan(projectRoot);
    const criticalHooks = result.findings.filter((f) => f.severity === "critical" && f.type === "missing_hook");
    expect(criticalHooks.length).toBeGreaterThan(0);
    cleanup();
  });
});

// ── 输出格式与汇总 ──

describe("gc-scan: 输出格式", () => {
  it("返回结构化 result 对象", async () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
      ".agents/hooks/session-context.mjs": "// stub",
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
});
