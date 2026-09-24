/**
 * tests/harness-context.test.mjs — harness-context.mjs 共享工具库测试
 */

import { describe, it, expect, vi } from "vitest";
import {
  getHarnessPaths,
  getGitContext,
  getHarnessState,
  getLatestHandoverSummary,
  getClaudeMdStatus,
} from "../.agents/hooks/lib/harness-context.mjs";
import { createVirtualProject } from "./setup.mjs";

// Mock child_process for git commands
vi.mock("child_process", () => ({
  execSync: vi.fn(() => {
    throw new Error("no git");
  }),
}));

describe("getHarnessPaths", () => {
  it("解析现代 .harness 路径与向后兼容路径", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".harness/state.json": "{}",
    });
    const paths = getHarnessPaths(projectRoot);
    expect(paths.stateFile.replace(/\\/g, "/")).toContain(".harness/state.json");
    expect(paths.handoversDir.replace(/\\/g, "/")).toContain("docs/handovers");
    cleanup();
  });

  it("无 .harness 时向后兼容读取 .claude 路径", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".claude/.harness-state": "{}",
    });
    const paths = getHarnessPaths(projectRoot);
    expect(paths.stateFile.replace(/\\/g, "/")).toContain(".claude/.harness-state");
    cleanup();
  });
});

describe("getGitContext", () => {
  it("非 git 目录 → 返回 null", () => {
    const { projectRoot, cleanup } = createVirtualProject({});
    const result = getGitContext(projectRoot);
    expect(result).toBeNull();
    cleanup();
  });
});

describe("getHarnessState", () => {
  it("现代 .harness/state.json 存在 → 解析正确", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".harness/state.json": '{"phase":"fix","mode":"hotfix","since":"2026-01-01"}',
    });
    const result = getHarnessState(projectRoot);
    expect(result.phase).toBe("fix");
    expect(result.mode).toBe("hotfix");
    expect(result.since).toBe("2026-01-01");
    cleanup();
  });

  it("向后兼容 .claude/.harness-state", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".claude/.harness-state": '{"phase":"design","mode":"tweak"}',
    });
    const result = getHarnessState(projectRoot);
    expect(result.phase).toBe("design");
    expect(result.mode).toBe("tweak");
    cleanup();
  });

  it("文件缺失 → 返回 null", () => {
    const { projectRoot, cleanup } = createVirtualProject({});
    const result = getHarnessState(projectRoot);
    expect(result).toBeNull();
    cleanup();
  });

  it("JSON 损坏 → 返回 null", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      ".harness/state.json": "not json",
    });
    const result = getHarnessState(projectRoot);
    expect(result).toBeNull();
    cleanup();
  });
});

describe("getLatestHandoverSummary", () => {
  it("空仓无交接记录 → 返回 null（空仓优雅降级）", () => {
    const { projectRoot, cleanup } = createVirtualProject({});
    const result = getLatestHandoverSummary(projectRoot);
    expect(result).toBeNull();
    cleanup();
  });

  it("有交接 README 但无数据行 → 返回 null", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "docs/handovers/README.md": "# 索引\n| 归档日期 | 文档索引 | 核心主题摘要 | 状态标签 |\n| :--- | :--- | :--- | :--- |\n",
    });
    const result = getLatestHandoverSummary(projectRoot);
    expect(result).toBeNull();
    cleanup();
  });

  it("有交接记录 → 解析首行摘要与文档路由地图", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "docs/handovers/README.md": `# 索引
| 归档日期 | 文档索引 | 核心主题摘要 | 状态标签 |
| :--- | :--- | :--- | :--- |
| 2026-09-24 | [2026-09-24 重构完成](./2026-09-24_refactor.md) | 完成两层架构重构 | 生产基准 |
`,
      "docs/handovers/2026-09-24_refactor.md": `# 交接
## 🗺️ 路由式摘要
- **当前系统状态**：已完成重构
- **接班即刻动作**：运行 npm test
`,
    });
    const result = getLatestHandoverSummary(projectRoot);
    expect(result).not.toBeNull();
    expect(result.date).toBe("2026-09-24");
    expect(result.title).toBe("2026-09-24 重构完成");
    expect(result.summary).toBe("完成两层架构重构");
    expect(result.routeMap.length).toBe(2);
    expect(result.routeMap[0]).toContain("当前系统状态");
    cleanup();
  });
});

describe("getClaudeMdStatus", () => {
  it("规则文件缺失 → exists=false", () => {
    const { projectRoot, cleanup } = createVirtualProject({});
    const result = getClaudeMdStatus(projectRoot);
    expect(result.exists).toBe(false);
    cleanup();
  });

  it("CLAUDE.md 有占位符 → hasPlaceholders=true", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "CLAUDE.md": "用途：【待填写】",
    });
    const result = getClaudeMdStatus(projectRoot);
    expect(result.exists).toBe(true);
    expect(result.hasPlaceholders).toBe(true);
    cleanup();
  });

  it("AGENTS.md 无占位符 → hasPlaceholders=false", () => {
    const { projectRoot, cleanup } = createVirtualProject({
      "AGENTS.md": "# 项目概要\n用途：完成\n技术栈：Node.js\n",
    });
    const result = getClaudeMdStatus(projectRoot);
    expect(result.hasPlaceholders).toBe(false);
    cleanup();
  });
});
