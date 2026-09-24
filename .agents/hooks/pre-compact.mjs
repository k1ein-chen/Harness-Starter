/**
 * PreCompact Hook — 上下文压缩前保存会话快照。
 * 使用 harness-context.mjs 共享库获取数据，只负责格式化输出。
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getGitContext,
  getHarnessState,
  getLatestHandoverSummary,
} from "./lib/harness-context.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

const lines = ["[PreCompact: 会话状态快照]", ""];

// 1. Git 上下文
const git = getGitContext(projectRoot);
if (git) {
  lines.push("当前分支: " + git.branch);
  if (git.changedFiles.length > 0) {
    lines.push("未提交变更: " + git.changedFiles.length + " 个文件");
    const shown = git.changedFiles.slice(0, 10);
    for (const f of shown) lines.push("  " + f);
    if (git.changedFiles.length > 10) lines.push("  ...及其他 " + (git.changedFiles.length - 10) + " 个文件");
  }
  lines.push("");
  if (git.lastCommit) {
    lines.push("最近提交: " + git.lastCommit);
    lines.push("");
  }
}

// 2. Harness 状态
const harness = getHarnessState(projectRoot);
if (harness) {
  lines.push("Harness 状态: 阶段=" + harness.phase + " | 模式=" + harness.mode);
  lines.push("");
}

// 3. 最新交接断点
const handover = getLatestHandoverSummary(projectRoot);
if (handover) {
  lines.push(`最新交接归档 [${handover.date}]: ${handover.title}`);
  lines.push("");
}

lines.push("---");

process.stdout.write(lines.join("\n"));
