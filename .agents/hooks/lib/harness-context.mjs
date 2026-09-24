/**
 * harness-context.mjs — 共享钩子与环境上下文工具库
 *
 * 为 SessionStart 与各生命周期工具提供结构化数据读取层。
 * 遵循 Node.js 原生跨平台实现，所有函数文件缺失时返回 null/空值，不抛出未捕获异常。
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// ── 内部工具 ──

const run = (cmd, projectRoot, timeout = 3000) => {
  try {
    return execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

// ── 公开 API ──

/**
 * 获取统一路径解析与向后兼容映射
 */
export function getHarnessPaths(projectRoot) {
  const harnessDir = join(projectRoot, ".harness");
  const claudeDir = join(projectRoot, ".claude");
  const agentsDir = join(projectRoot, ".agents");
  const isModernHarness = existsSync(harnessDir);

  return {
    root: projectRoot,
    stateFile: isModernHarness
      ? join(harnessDir, "state.json")
      : existsSync(join(claudeDir, ".harness-state"))
      ? join(claudeDir, ".harness-state")
      : join(harnessDir, "state.json"),
    versionFile: isModernHarness
      ? join(harnessDir, "version.json")
      : existsSync(join(claudeDir, ".harness-version"))
      ? join(claudeDir, ".harness-version")
      : join(harnessDir, "version.json"),
    handoversDir: join(projectRoot, "docs", "handovers"),
    handoversReadme: join(projectRoot, "docs", "handovers", "README.md"),
    claudeDir,
    agentsDir,
    harnessDir,
  };
}

/**
 * 获取 Git 上下文
 * @returns {{ branch: string, status: string, changedFiles: string[], lastCommit: string } | null}
 */
export function getGitContext(projectRoot) {
  const gitRoot = run("git rev-parse --show-toplevel", projectRoot);
  if (!gitRoot) return null;

  const branch = run("git rev-parse --abbrev-ref HEAD", projectRoot) || "unknown";
  const status = run("git status --short", projectRoot);
  const changedFiles = status.split("\n").filter(Boolean).map((l) => l.trim());
  const lastCommit = run("git log -1 --oneline", projectRoot);

  return { branch, status, changedFiles, lastCommit };
}

/**
 * 获取 Harness 运行状态
 * @returns {{ phase: string, mode: string, since: string } | null}
 */
export function getHarnessState(projectRoot) {
  const paths = getHarnessPaths(projectRoot);
  if (!existsSync(paths.stateFile)) return null;

  try {
    const state = JSON.parse(readFileSync(paths.stateFile, "utf-8"));
    return {
      phase: state.phase || "build",
      mode: state.mode || "full",
      since: state.since || "",
    };
  } catch {
    return null;
  }
}

/**
 * 获取最新 HDD 任务交接卡摘要 (Handoff Summary)
 * 用于 SessionStart 极轻冷启动，空仓或无记录时返回 null。
 *
 * @param {string} projectRoot
 * @returns {{ date: string, title: string, summary: string, routeMap: string[] } | null}
 */
export function getLatestHandoverSummary(projectRoot) {
  const paths = getHarnessPaths(projectRoot);
  if (!existsSync(paths.handoversReadme)) return null;

  try {
    const readmeContent = readFileSync(paths.handoversReadme, "utf-8");
    const lines = readmeContent.split("\n");
    const tableHeaderIndex = lines.findIndex((l) => l.includes("| :---") || l.includes("|:---"));
    if (tableHeaderIndex === -1) return null;

    // 查找表头下方的第一条真实记录
    const rows = lines
      .slice(tableHeaderIndex + 1)
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|") && !l.includes("文档索引"));

    if (rows.length === 0) return null;

    const topRow = rows[0];
    const cols = topRow
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);

    if (cols.length < 3) return null;

    const date = cols[0];
    const titleCol = cols[1];
    const summary = cols[2];

    // 尝试提取链接中的具体文档名
    const matchLink = titleCol.match(/\[(.*?)\]\(\.\/(.*?)\)/);
    const title = matchLink ? matchLink[1] : titleCol;
    const docRelPath = matchLink ? matchLink[2] : null;

    const routeMap = [];
    if (docRelPath) {
      const fullDocPath = join(paths.handoversDir, docRelPath);
      if (existsSync(fullDocPath)) {
        const docContent = readFileSync(fullDocPath, "utf-8");
        const sectionMatch = docContent.split("## 🗺️ 路由式摘要")[1] || docContent.split("## 路由式摘要")[1];
        if (sectionMatch) {
          const sectionContent = sectionMatch.split("\n## ")[0] || "";
          const points = sectionContent
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("- **") || l.startsWith("- "));
          routeMap.push(...points.slice(0, 5));
        }
      }
    }

    return {
      date,
      title,
      summary,
      routeMap,
    };
  } catch {
    return null;
  }
}

/**
 * 检查 CLAUDE.md / AGENTS.md 占位符状态
 * @returns {{ exists: boolean, hasPlaceholders: boolean, file: string }}
 */
export function getClaudeMdStatus(projectRoot) {
  const claudePath = join(projectRoot, "CLAUDE.md");
  const agentsPath = join(projectRoot, "AGENTS.md");

  const targetPath = existsSync(claudePath) ? claudePath : existsSync(agentsPath) ? agentsPath : null;
  if (!targetPath) return { exists: false, hasPlaceholders: false, file: "" };

  const content = readFileSync(targetPath, "utf-8");
  return {
    exists: true,
    hasPlaceholders: content.includes("【待填写"),
    file: targetPath.endsWith("CLAUDE.md") ? "CLAUDE.md" : "AGENTS.md",
  };
}
