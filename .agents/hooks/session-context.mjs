/**
 * SessionStart Hook — 会话冷启动上下文注入
 *
 * 遵循 HDD (Handoff-Driven Development) 范式：
 * - 空仓降级：无交接记录时输出轻量提示，绝不卡顿或白屏；
 * - 有交接记录：仅注入最新一条交接卡的路由摘要，实现 5ms 高效冷启动与 Prompt Cache 友好。
 */
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  getGitContext,
  getHarnessState,
  getLatestHandoverSummary,
  getClaudeMdStatus,
} from "./lib/harness-context.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

const lines = ["--- SessionStart Hook ---"];

// 1. Git 上下文
const git = getGitContext(projectRoot);
if (git) {
  lines.push("分支: " + git.branch);
  if (git.changedFiles.length > 0) {
    lines.push("未提交变更: " + git.changedFiles.length + " 个文件");
  } else {
    lines.push("工作区: 干净 (无未提交变更)");
  }
} else {
  lines.push("分支: （非 git 目录）");
}

// 2. Harness 运行状态
const harness = getHarnessState(projectRoot);
if (harness) {
  lines.push("Harness: 阶段=" + harness.phase + "  模式=" + harness.mode);
}

// 3. HDD 任务交接感知（空仓优雅降级）
const handover = getLatestHandoverSummary(projectRoot);
if (handover) {
  lines.push("---");
  lines.push(`最新交接断点 [${handover.date}]: ${handover.title}`);
  if (handover.summary) {
    lines.push("摘要: " + handover.summary);
  }
  if (handover.routeMap && handover.routeMap.length > 0) {
    lines.push("路由导引:");
    for (const r of handover.routeMap) {
      lines.push("  " + r);
    }
  }
} else {
  lines.push("---");
  lines.push("交接状态: 尚无交接卡（完成阶段性任务时请遵循 .agents/skills/handover/ 归档）");
}

// 4. 占位符检查
const claude = getClaudeMdStatus(projectRoot);
if (claude && claude.hasPlaceholders) {
  lines.push("---");
  lines.push(`⚠️ ${claude.file} 还有待填写占位符，建议先完善项目概要`);
}

lines.push("------------------------");

process.stdout.write(lines.join("\n"));
