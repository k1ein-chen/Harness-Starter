/**
 * tests/check.test.mjs — check.mjs 测试
 *
 * 覆盖规则规范检查、运行时目录与 Hook 检查、语言检测、LSP 检查。
 */

import { describe, it, expect, vi } from "vitest";
import { check } from "../scripts/check.mjs";
import { createVirtualProject, Fixtures } from "./setup.mjs";

// Mock child_process for LSP version checks
vi.mock("child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("not found");
  }),
}));

describe("check.mjs: 核心文件与规范检查", () => {
  it("完整项目 → 核心规则与目录全部通过", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      "CLAUDE.md": "@AGENTS.md",
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
      ".agents/hooks/session-context.mjs": "// stub",
      ".agents/skills/handover/SKILL.md": "# stub",
      "docs/handovers/README.md": "# stub",
      "scripts/init.mjs": "// stub",
      "package.json": "{}",
    });
    const result = check(projectRoot);

    const coreChecks = ["规则规范 (AGENTS.md / CLAUDE.md)", "运行时目录 (.agents/ 或 .claude/)", "settings.json"];
    for (const name of coreChecks) {
      const c = result.checks.find((item) => item.name === name);
      expect(c.ok).toBe(true);
    }
    cleanup();
  });

  it("缺少 AGENTS.md 和 CLAUDE.md → 规则规范失败", () => {
    const { projectRoot, cleanup } = createVirtualProject({});
    const result = check(projectRoot);
    const c = result.checks.find((item) => item.name.includes("规则规范"));
    expect(c.ok).toBe(false);
    cleanup();
  });
});

describe("check.mjs: Hook 与 HDD 检查", () => {
  it("具备核心 Hook 与 Handover 技能 → 通过", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
      ".agents/hooks/session-context.mjs": "// stub",
      ".agents/skills/handover/SKILL.md": "# handover",
    });
    const result = check(projectRoot);
    const preTool = result.checks.find((c) => c.name === "hooks/pre-tool-check.mjs");
    const sessionCtx = result.checks.find((c) => c.name === "hooks/session-context.mjs");
    const handover = result.checks.find((c) => c.name === "handover 交付技能");

    expect(preTool.ok).toBe(true);
    expect(sessionCtx.ok).toBe(true);
    expect(handover.ok).toBe(true);
    cleanup();
  });

  it("缺少必备 Hook → 失败", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      // 只有 pre-tool-check，缺少 session-context
      ".agents/hooks/pre-tool-check.mjs": "// stub",
    });
    const result = check(projectRoot);
    const sessionCtx = result.checks.find((c) => c.name === "hooks/session-context.mjs");
    expect(sessionCtx.ok).toBe(false);
    cleanup();
  });
});

describe("check.mjs: 语言检测", () => {
  it("Node.js/TypeScript 项目 → 检测到", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      "package.json": '{"name": "test"}',
    });
    const result = check(projectRoot);
    const lang = result.checks.find((c) => c.name === "检测项目语言");
    expect(lang.ok).toBe(true);
    expect(lang.hint).toContain("Node.js/TypeScript");
    cleanup();
  });

  it("多语言项目 → 全部检测到", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      "package.json": '{"name": "test"}',
      "pyproject.toml": "[tool]",
      "go.mod": "module test",
    });
    const result = check(projectRoot);
    const lang = result.checks.find((c) => c.name === "检测项目语言");
    expect(lang.hint).toContain("Node.js/TypeScript");
    expect(lang.hint).toContain("Python");
    expect(lang.hint).toContain("Go");
    cleanup();
  });
});

describe("check.mjs: 返回结构", () => {
  it("返回 checks 数组 + okCount + criticalFails", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": Fixtures.completeAgentsMd,
      ".claude/settings.json": Fixtures.minimalSettingsJson,
      ".agents/hooks/pre-tool-check.mjs": "// stub",
      ".agents/hooks/session-context.mjs": "// stub",
      ".agents/skills/handover/SKILL.md": "# stub",
      "scripts/init.mjs": "// stub",
      "package.json": "{}",
    });
    const result = check(projectRoot);
    expect(Array.isArray(result.checks)).toBe(true);
    expect(typeof result.okCount).toBe("number");
    expect(typeof result.criticalFails).toBe("number");
    expect(result.okCount).toBeLessThanOrEqual(result.checks.length);
    cleanup();
  });
});
