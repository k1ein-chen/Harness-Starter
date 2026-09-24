/**
 * tests/setup.mjs — 共享测试工具
 *
 * 提供虚拟项目树工厂函数，用于隔离测试脚本对文件系统和 git 的依赖。
 */
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

/**
 * 创建一个虚拟项目目录，包含指定的文件。
 *
 * @param {Record<string, string|null>} fileMap
 *   key = 相对项目根的文件路径, value = 文件内容（null 表示创建空目录）
 * @returns {{ projectRoot: string, cleanup: () => void }}
 *   返回项目根路径和清理函数
 */
export function createVirtualProject(fileMap = {}) {
  const projectRoot = join(tmpdir(), "harness-test-" + randomUUID().slice(0, 8));
  mkdirSync(projectRoot, { recursive: true });

  for (const [relPath, content] of Object.entries(fileMap)) {
    const fullPath = join(projectRoot, relPath);

    if (content === null) {
      mkdirSync(fullPath, { recursive: true });
      continue;
    }

    const dir = fullPath.includes("/") || fullPath.includes("\\")
      ? fullPath.replace(/[/\\][^/\\]+$/, "")
      : fullPath;
    if (dir !== fullPath) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(fullPath, content, "utf-8");
  }

  return {
    projectRoot,
    cleanup: () => {
      try {
        rmSync(projectRoot, { recursive: true, force: true });
      } catch {}
    },
  };
}

export const Fixtures = {
  minimalAgentsMd:
    "# 项目规范\n## 行为准则\n### Think Before Coding\n### 消除信息差\n### Simplicity First\n### Surgical Changes\n### Goal-Driven\n",

  completeAgentsMd:
    "# 项目规范\n## 行为准则\n### Think Before Coding\n### 消除信息差\n### 讨论与执行分离\n### Simplicity First\n### Surgical Changes\n### Goal-Driven\n",

  completeClaudeMd:
    "# 项目概要\n用途：测试项目\n技术栈：Node.js\n跑测试：npm test\n\n# 行为准则\n## Think Before Coding\n## 消除信息差\n## 讨论与执行分离\n## Simplicity First\n## Surgical Changes\n## Goal-Driven\n",

  minimalSettingsJson:
    '{\n  "hooks": {\n    "PreToolUse": [{"type": "command", "command": "node .agents/hooks/pre-tool-check.mjs"}],\n    "SessionStart": [{"type": "command", "command": "node .agents/hooks/session-context.mjs"}]\n  }\n}',

  minimalLspJson:
    '{\n  "languages": {\n    "typescript": {\n      "command": "typescript-language-server",\n      "args": ["--stdio"],\n      "extensions": [".ts", ".tsx", ".js", ".jsx"]\n    }\n  }\n}',

  minimalGitignore: "node_modules/\n.harness/\n",

  minimalHarnessState: '{"phase": "build", "mode": "full"}',
};
