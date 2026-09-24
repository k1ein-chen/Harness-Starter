/**
 * gc-scan.mjs — Harness Starter GC 扫描器
 *
 * 确定性健康检查，不依赖 AI。外部验证门（Sniff 模式）。
 *
 * 用法: node scripts/gc-scan.mjs [--json] [--ci]
 *
 * 扫描维度（权威清单 — 与 harness-gc SKILL.md 保持同步）:
 *   1. CLAUDE.md 完整性 — 文件存在、必要章节、占位符
 *   2. Git 状态 — 未提交变更数、调试残留
 *   3. TODO/FIXME 密度 — 单文件超过 5 处时报告
 *   4. .gitignore 健康 — 关键目录是否被忽略
 *   5. Hook 注册状态 — 必要 Hook 文件存在且已注册
 *   6. Harness 状态 — .harness-state 文件有效
 *   7. TypeScript 类型检查 — tsc --noEmit（如存在 tsconfig.json）
 *   8. LSP 配置 — .lsp.json 存在且包含 TypeScript
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname, resolve, relative } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = resolve(__dirname, "..");

/**
 * 执行一次健康扫描，返回结构化结果。
 *
 * @param {string} [projectRoot] — 项目根目录，默认从脚本位置推导
 * @param {{ json?: boolean, ci?: boolean }} [options] — 输出选项（CLI 用）
 * @returns {{ scanId: string, timestamp: string, summary: { total: number, critical: number, warning: number, info: number }, context: { branch: string, lastCommit: string }, findings: Array }}
 */
export async function scan(projectRoot, options = {}) {
  const root = projectRoot || defaultProjectRoot;

  const run = (cmd, opts = {}) => {
    try {
      return execSync(cmd, {
        cwd: root,
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "ignore"],
        ...opts,
      }).trim();
    } catch { return ""; }
  };

  // Capture stdout+stderr even when the command fails (replaces shell redirect combo)
  const runAllowFail = (cmd) => {
    try {
      return execSync(cmd, {
        cwd: root,
        encoding: "utf-8",
        timeout: 30000,
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch (e) {
      return [e.stdout, e.stderr].filter(Boolean).join("\n").trim();
    }
  };

  const findings = [];
  const addFinding = (type, severity, file, line, message, detail) => {
    findings.push({ type, severity, file, line, message, detail, ts: new Date().toISOString() });
  };

  // ── 1. CLAUDE.md 完整性 ──────────────────

  const claudeMdPath = join(root, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) {
    addFinding("missing_file", "critical", "CLAUDE.md", 0, "CLAUDE.md 缺失", "项目根缺少 CLAUDE.md");
  } else {
    const content = readFileSync(claudeMdPath, "utf-8");
    const lines = content.split("\n");
    for (const s of ["行为准则", "消除信息差", "Simplicity First", "Surgical Changes", "Goal-Driven"]) {
      if (!content.includes(s)) {
        addFinding("missing_section", "warning", "CLAUDE.md", 0, "缺少章节: " + s, "未找到 " + s);
      }
    }
    const todoLine = lines.findIndex(l => l.includes("【待填写"));
    if (todoLine !== -1) {
      addFinding("placeholder", "warning", "CLAUDE.md", todoLine + 1, "存在未占位符", lines[todoLine].trim());
    }
  }

  // ── 2. Git 状态 ────────────────────────────

  const gitRoot = run("git rev-parse --show-toplevel");
  if (gitRoot) {
    const uncommitted = run("git status --short");
    const uncommittedLines = uncommitted.split("\n").filter(Boolean);
    if (uncommittedLines.length > 10) {
      addFinding("many_uncommitted", "info", ".", 0, "大量未提交变更 (" + uncommittedLines.length + " 个文件)", "建议及时提交");
    }
    const diffContent = run("git diff --unified=0") + "\n" + run("git diff --cached --unified=0");
    if (/console\.\w+\s*\(/.test(diffContent)) {
      addFinding("debug_residue", "warning", "(diff)", 0, "调试残留: console.log", "变更中包含 console.log");
    }
    if (/\bdebugger\b/.test(diffContent)) {
      addFinding("debug_residue", "warning", "(diff)", 0, "调试残留: debugger", "变更中包含 debugger");
    }
  }

  // ── 3. TODO/FIXME 密度 ────────────────────

  const scanDir = (dir, depth = 0) => {
    if (depth > 4 || !existsSync(dir)) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".git") continue;
        if (entry.isDirectory()) { scanDir(fullPath, depth + 1); continue; }
        if (!/\.(mjs|js|ts|tsx|jsx|md|json|yaml|yml)$/i.test(entry.name)) continue;
        if (fullPath.endsWith("gc-scan.mjs")) continue;
        const content = readFileSync(fullPath, "utf-8");
        const total = (content.match(/\bTODO\b/g) || []).length + (content.match(/\bFIXME\b/g) || []).length;
        if (total > 5) {
          addFinding("todo_cluster", "info", relative(root, fullPath), 0, "TODO/FIXME 集中 (" + total + " 处)", total + " 处");
        }
      }
    } catch { /* skip */ }
  };
  scanDir(root);

  // ── 4. .gitignore 健康 ─────────────────────

  const gitignorePath = join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const giContent = readFileSync(gitignorePath, "utf-8");
    for (const entry of ["node_modules/", ".claude/reviews/", ".claude/loops/"]) {
      if (!giContent.includes(entry) && existsSync(join(root, entry.replace(/\/$/, "")))) {
        addFinding("gitignore_missing", "info", ".gitignore", 0, ".gitignore 缺少: " + entry, entry + " 存在但未被忽略");
      }
    }
  } else {
    addFinding("missing_file", "warning", ".gitignore", 0, ".gitignore 缺失", "建议创建");
  }

  // ── 5. Hook 注册状态 ──────────────────────

  const hooksDir = join(root, ".claude/hooks");
  if (existsSync(hooksDir)) {
    const hooksFiles = readdirSync(hooksDir).filter(f => f.endsWith(".mjs"));
    for (const h of ["pre-tool-check.mjs", "session-context.mjs", "session-review.mjs"]) {
      if (!hooksFiles.includes(h)) {
        addFinding("missing_hook", "critical", ".claude/hooks/", 0, "缺失 Hook: " + h, "必备安全/上下文 Hook");
      }
    }
    const settingsPath = join(root, ".claude/settings.json");
    if (existsSync(settingsPath)) {
      const sc = readFileSync(settingsPath, "utf-8");
      const map = { "pre-tool-check.mjs": "PreToolUse", "post-tool-check.mjs": "PostToolUse", "session-context.mjs": "SessionStart", "session-review.mjs": "Stop", "pre-compact.mjs": "PreCompact" };
      for (const h of hooksFiles) {
        const ev = map[h];
        if (!ev) continue;
        const isRegistered = sc.includes(ev) && sc.includes(h);
        const isCommented = sc.includes("// " + ev);
        if (!isRegistered) {
          addFinding("hook_not_registered", "warning", ".claude/settings.json", 0, "Hook 未注册: " + h + (isCommented ? " (被注释)" : ""), "请在 settings.json 中注册");
        }
      }
    }
  } else {
    addFinding("missing_dir", "critical", ".claude/hooks/", 0, "Hooks 目录缺失");
  }

  // ── 6. Harness 状态 ────────────────────────

  const statePath = join(root, ".claude/.harness-state");
  if (existsSync(statePath)) {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      if (!state.phase || !state.mode) {
        addFinding("harness_state_invalid", "warning", ".claude/.harness-state", 0, ".harness-state 缺少必要字段", "需要 phase 和 mode");
      }
    } catch {
      addFinding("harness_state_invalid", "warning", ".claude/.harness-state", 0, ".harness-state JSON 解析失败", "文件可能已损坏");
    }
  } else {
    addFinding("missing_file", "info", ".claude/.harness-state", 0, ".harness-state 缺失", "初始化时自动创建");
  }

  // ── 7. TypeScript 类型检查 ────────────────

  if (existsSync(join(root, "tsconfig.json"))) {
    const tscResult = runAllowFail("npx tsc --noEmit");
    const errors = (tscResult.match(/error TS\d+/g) || []).length;
    if (errors > 0) {
      addFinding("tsc_errors", "warning", "(tsc --noEmit)", 0, "类型错误: " + errors + " 个", tscResult.split("\n").slice(0, 5).join("\n"));
    } else if (tscResult && !tscResult.includes("error TS")) {
      addFinding("tsc_pass", "info", "(tsc --noEmit)", 0, "TypeScript 类型检查通过", "无类型错误");
    }
  }

  // ── 8. LSP 配置 ────────────────────────────

  const lspPath = join(root, ".lsp.json");
  if (existsSync(lspPath)) {
    if (!readFileSync(lspPath, "utf-8").includes("typescript-language-server")) {
      addFinding("lsp_config", "info", ".lsp.json", 0, "LSP 未配置 TypeScript", "其他语言服务");
    }
  } else {
    addFinding("missing_file", "warning", ".lsp.json", 0, ".lsp.json 缺失", "LSP 不可用");
  }

  // ── 汇总 ──────────────────────────────────

  const bySeverity = { critical: [], warning: [], info: [] };
  for (const f of findings) bySeverity[f.severity].push(f);

  const branch = gitRoot ? run("git rev-parse --abbrev-ref HEAD") : "n/a";
  const lastCommit = gitRoot ? run("git log -1 --oneline") : "n/a";

  return {
    scanId: "gc-" + Date.now(),
    timestamp: new Date().toISOString(),
    summary: {
      total: findings.length,
      critical: bySeverity.critical.length,
      warning: bySeverity.warning.length,
      info: bySeverity.info.length,
    },
    context: { branch, lastCommit },
    findings,
  };
}

// ═══════════════════════════════════════════════════════════════════
// CLI 入口
// ═══════════════════════════════════════════════════════════════════

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isJson = process.argv.includes("--json");
  const isCi = process.argv.includes("--ci");

  const result = await scan(defaultProjectRoot);

  if (isJson) {
    process.stdout.write(JSON.stringify(result, null, 2));
  } else {
    console.log("\n=== GC Scan: " + result.scanId + " ===");
    console.log("  分支: " + result.context.branch + "  提交: " + result.context.lastCommit);
    console.log("  总计: " + result.summary.total + "  (" + result.summary.critical + " critical, " + result.summary.warning + " warning, " + result.summary.info + " info)");
    console.log("");
    for (const f of result.findings) {
      const icon = f.severity === "critical" ? "[CRIT]" : f.severity === "warning" ? "[WARN]" : "[INFO]";
      console.log("  " + icon + " " + f.message);
      if (f.file) console.log("      文件: " + f.file + (f.line ? ":" + f.line : ""));
      if (f.detail) console.log("      " + f.detail.slice(0, 120));
      console.log("");
    }
  }

  // 持久化到 LOG.md
  const loopsDir = join(defaultProjectRoot, ".claude/loops");
  if (!existsSync(loopsDir)) mkdirSync(loopsDir, { recursive: true });
  const logPath = join(loopsDir, "LOG.md");
  let logContent = existsSync(logPath) ? readFileSync(logPath, "utf-8") : "";
  const logLine = "| " + result.timestamp + " | auto | " + result.summary.total + " (" + result.summary.critical + "c " + result.summary.warning + "w " + result.summary.info + "i) | — |";
  if (logContent.trim().split("\n").filter(l => l.includes("|")).length <= 2) {
    logContent += "\n" + logLine;
  } else {
    logContent = logContent.trimEnd() + "\n" + logLine;
  }
  writeFileSync(logPath, logContent + "\n", "utf-8");

  if (isCi && result.summary.critical > 0) process.exit(1);
}
