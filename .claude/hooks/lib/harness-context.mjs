/**
 * harness-context.mjs — 共享钩子上下文工具库
 *
 * session-context 和 pre-compact 钩子的数据读取层，消除重复逻辑。
 * 每个函数接受 projectRoot，返回结构化数据；文件缺失时返回 null/空值，不抛异常。
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// ── 内部工具 ──

// 跨平台执行：stderr 静默丢弃，避免依赖 Unix 重定向（Windows cmd 不支持）
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
 * 获取 Git 上下文。
 * @returns {{ branch: string, status: string, changedFiles: string[], lastCommit: string } | null}
 */
export function getGitContext(projectRoot) {
  const gitRoot = run("git rev-parse --show-toplevel", projectRoot);
  if (!gitRoot) return null;

  const branch = run("git rev-parse --abbrev-ref HEAD", projectRoot) || "unknown";
  const status = run("git status --short", projectRoot);
  const changedFiles = status.split("\n").filter(Boolean).map(l => l.trim());
  const lastCommit = run("git log -1 --oneline", projectRoot);

  return { branch, status, changedFiles, lastCommit };
}

/**
 * 获取 Loop 状态（STATE.md + LOG.md）。
 * @returns {{ phase: string, lastRun: string, findingsOpen: string, recentScans: string[] } | null}
 */
export function getLoopState(projectRoot) {
  const loopsDir = join(projectRoot, ".claude/loops");
  const statePath = join(loopsDir, "STATE.md");

  if (!existsSync(statePath)) return null;

  const sc = readFileSync(statePath, "utf-8");
  const phaseMatch = sc.match(/\*\*Phase\*\*: (.+)/);
  const lastRunMatch = sc.match(/\*\*Last Run\*\*: (.+)/);
  const findingsMatch = sc.match(/\*\*Findings Open\*\*: (.+)/);

  const recentScans = [];
  const logPath = join(loopsDir, "LOG.md");
  if (existsSync(logPath)) {
    const logContent = readFileSync(logPath, "utf-8");
    const entries = logContent
      .split("\n")
      .filter(l => l.includes("|") && l.includes("auto") && !l.includes("Timestamp |"))
      .slice(-3);
    for (const e of entries) {
      const cols = e.split("|").map(c => c.trim()).filter(Boolean);
      if (cols.length >= 3) recentScans.push(cols[0] + " → " + cols[2]);
    }
  }

  return {
    phase: phaseMatch ? phaseMatch[1] : "unknown",
    lastRun: lastRunMatch ? lastRunMatch[1] : "never",
    findingsOpen: findingsMatch ? findingsMatch[1] : "0",
    recentScans,
  };
}

/**
 * 获取审查报告摘要。
 * @returns {{ count: number, recentFiles: string[], recentFlags: string[] } | null}
 */
export function getReviewSummary(projectRoot) {
  const reviewsDir = join(projectRoot, ".claude/reviews");
  if (!existsSync(reviewsDir)) return null;

  const reviewFiles = readdirSync(reviewsDir)
    .filter(f => f.endsWith(".md"))
    .sort()
    .reverse();

  const count = reviewFiles.length;
  const recentFiles = reviewFiles.slice(0, 5);
  const recentFlags = [];

  for (const file of recentFiles) {
    const content = readFileSync(join(reviewsDir, file), "utf-8");
    const flagSection = (content.split("### 规则检查\n")[1] || "").split("\n###")[0] || "";
    const flags = flagSection.split("\n").filter(l => l.trim());
    recentFlags.push(...flags.map(f => "  " + f));
  }

  return { count, recentFiles, recentFlags };
}

/**
 * 获取 Harness 状态（.harness-state）。
 * @returns {{ phase: string, mode: string, since: string } | null}
 */
export function getHarnessState(projectRoot) {
  const statePath = join(projectRoot, ".claude/.harness-state");
  if (!existsSync(statePath)) return null;

  try {
    const state = JSON.parse(readFileSync(statePath, "utf-8"));
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
 * 检查 CLAUDE.md 状态。
 * @returns {{ exists: boolean, hasPlaceholders: boolean }}
 */
export function getClaudeMdStatus(projectRoot) {
  const path = join(projectRoot, "CLAUDE.md");
  if (!existsSync(path)) return { exists: false, hasPlaceholders: false };

  const content = readFileSync(path, "utf-8");
  return {
    exists: true,
    hasPlaceholders: content.includes("【待填写"),
  };
}
