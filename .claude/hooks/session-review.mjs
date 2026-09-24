import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");
const reviewsDir = join(projectRoot, ".claude/reviews");

// 读取 Harness 状态
let harnessState = { phase: "build", mode: "full" };
const statePath = join(projectRoot, ".claude/.harness-state");
if (existsSync(statePath)) {
  try {
    harnessState = { ...harnessState, ...JSON.parse(readFileSync(statePath, "utf-8")) };
  } catch {}
}
const isDesign = harnessState.phase === "design";
const isFix = harnessState.phase === "fix";
const isHotfix = harnessState.mode === "hotfix";
const isTweak = harnessState.mode === "tweak";

// 跨平台执行：stderr 静默丢弃，避免依赖 Unix 重定向（Windows cmd 不支持）
const run = (cmd) => {
  try {
    return execSync(cmd, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 8000,
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

// 合并 stdout+stderr（替代 shell 的 2>&1），失败时也返回已捕获输出
const runMerged = (cmd) => {
  const r = spawnSync(cmd, {
    cwd: projectRoot,
    encoding: "utf-8",
    timeout: 8000,
    shell: true,
  });
  return ((r.stdout || "") + (r.stderr || "")).trim();
};

// 1. 统计改动
const allChanged = run("git diff --name-only").split("\n").filter(Boolean);
const stagedFiles = run("git diff --cached --name-only").split("\n").filter(Boolean);
allChanged.push(...stagedFiles);

const added = run("git diff --diff-filter=A --name-only").split("\n").filter(Boolean);
const modified = run("git diff --diff-filter=M --name-only").split("\n").filter(Boolean);
const deleted = run("git diff --diff-filter=D --name-only").split("\n").filter(Boolean);

// 2. 敏感文件检查
const sensitivePatterns = [/(^|\/)\.env/, /node_modules/, /\.gitignore$/];
const sensitiveChanges = allChanged.filter((f) =>
  sensitivePatterns.some((p) => p.test(f))
);

// 3. Diff 大小分析（Simplicity First 检查）
const diffStat = run("git diff --stat");
const totalChanges = diffStat ? (diffStat.match(/(\d+) insertions?/)?.[1] || "0") : "0";
const totalDeletions = diffStat ? (diffStat.match(/(\d+) deletions?/)?.[1] || "0") : "0";
const totalLines = parseInt(totalChanges) + parseInt(totalDeletions);

// 4. 读取 CLAUDE.md 规则
const claudeMdPath = join(projectRoot, "CLAUDE.md");
let hasSurgicalRule = false;
let hasGoalRule = false;
if (existsSync(claudeMdPath)) {
  const rules = readFileSync(claudeMdPath, "utf-8");
  hasSurgicalRule = rules.includes("Surgical Changes");
  hasGoalRule = rules.includes("Goal-Driven");
}

// 5. 调试残留检查
const diffContent = run("git diff --unified=0") + "\n" + run("git diff --cached --unified=0");
const debugPatterns = [/console\.\w+\s*\(/, /\bTODO\b/, /\bFIXME\b/, /\bdebugger\b/];
const debugHits = debugPatterns.filter(p => p.test(diffContent)).map(p => {
  if (p.source === "console\\.\\w+\\s*\\(") return "console.log/warn/error";
  if (p.source === "\\bTODO\\b" || p.source === "\\bFIXME\\b") return p.source;
  if (p.source === "\\bdebugger\\b") return "debugger 语句";
  return p.source;
});

// 6. 未提交变更检查
const hasUncommitted = !!run("git status --short");

// 7. 依赖变更检查
const changedFiles = run("git diff --name-only").split("\n").concat(run("git diff --cached --name-only").split("\n")).filter(Boolean);
const depFiles = ["package.json", "pyproject.toml", "go.mod", "Cargo.toml", "Gemfile"];
const lockFiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "poetry.lock", "go.sum", "Cargo.lock", "Gemfile.lock"];
const depChanged = depFiles.some(d => changedFiles.some(f => f.endsWith(d)));
const lockChanged = lockFiles.some(l => changedFiles.some(f => f.endsWith(l)));
const depWithoutLock = depChanged && !lockChanged;

// 8. OpenSpec 验证（Node 原生列目录，不依赖 ls/grep）
const hasOpenSpec = existsSync(join(projectRoot, "openspec"));
let pendingChanges = "";
if (hasOpenSpec) {
  const changesDir = join(projectRoot, "openspec", "changes");
  if (existsSync(changesDir)) {
    pendingChanges = readdirSync(changesDir)
      .filter((f) => f !== "archive" && !f.startsWith("."))
      .join("\n");
  }
}
const openspecValidate = hasOpenSpec ? runMerged("openspec validate") : "";
const openspecPassed = openspecValidate && !openspecValidate.includes("error") && !openspecValidate.includes("FAIL");

// 写入报告
mkdirSync(reviewsDir, { recursive: true });

// 根据 phase/mode 调整阈值
const maxFiles = isFix ? 5 : (isDesign ? 20 : 10);
const maxLines = isHotfix ? Infinity : (isTweak ? Infinity : 500);

const tooManyFiles = allChanged.length > maxFiles;
const tooManyLines = totalLines > maxLines;

const flags = [];
if (sensitiveChanges.length > 0) flags.push("⚠️ 涉及敏感文件");
if (tooManyFiles) flags.push(`⚠️ 改动文件过多（>${maxFiles} 个），是否违反 Simplicity First？`);
if (tooManyLines) flags.push(`⚠️ 改动行数过多（>${maxLines} 行），建议分多次提交`);
if (pendingChanges) flags.push("ℹ️ 有待归档的 OpenSpec 变更，请运行 openspec archive");
if (openspecValidate && !openspecPassed) flags.push("❌ OpenSpec 验证未通过，请检查规范一致性");
if (openspecPassed) flags.push("✅ OpenSpec 验证通过");
// design/tweak 阶段跳过调试残留检查
if (!isDesign && !isTweak && debugHits.length > 0) {
  for (const hit of debugHits) {
    flags.push("⚠️ 变更中包含调试残留：" + hit);
  }
}
if (hasUncommitted) flags.push("ℹ️ 有未提交的变更，建议及时提交");
if (!isTweak && depWithoutLock) flags.push("⚠️ 依赖文件已修改但未更新 lock 文件");
if (isFix && allChanged.length > 5) flags.push("⚠️ 修复模式下变更范围偏大，确认是否超出修复目标");

// GC 扫描结果集成
const gcScanScript = join(projectRoot, "scripts/gc-scan.mjs");
if (existsSync(gcScanScript)) {
  try {
    const gcOutput = execSync("node " + gcScanScript + " --json", {
      cwd: projectRoot, encoding: "utf-8", timeout: 10000, stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const gcResult = JSON.parse(gcOutput);
    let gcFlags = [];
    for (const f of gcResult.findings || []) {
      if (f.severity === "critical") gcFlags.push("[GC] " + f.message);
      else if (f.severity === "warning") gcFlags.push("[GC] " + f.message);
    }
    if (gcFlags.length > 0) flags.push("---", "GC Scan (" + gcResult.summary.total + " 项发现):", ...gcFlags);
  } catch { /* gc-scan 失败不阻塞审查 */ }
}

const report = [
  "## Stop Hook 审查报告",
  `时间: ${new Date().toLocaleString("zh-CN")}`,
  "",
  "### 改动统计",
  `文件数: ${allChanged.length}`,
  added.length > 0 ? `新增: ${added.length}` : "",
  modified.length > 0 ? `修改: ${modified.length}` : "",
  deleted.length > 0 ? `删除: ${deleted.length}` : "",
  `总行数: +${totalChanges}/-${totalDeletions}`,
  "",
  "### 规则检查",
  ...(flags.length > 0 ? flags : ["✅ 未发现问题"]),
  "",
  sensitiveChanges.length > 0
    ? `### ⚠️ 敏感文件\n${sensitiveChanges.join("\n")}`
    : "",
  pendingChanges
    ? `### 待归档变更\n${pendingChanges}`
    : "",
  "",
  `CLAUDE.md 规则状态: ${hasSurgicalRule ? "✅ Surgical Changes" : "❌ 缺少 Surgical Changes"}`,
  `${hasGoalRule ? "✅" : "❌"} Goal-Driven Execution`,
  "",
  "---",
  "审查报告已累积至 .claude/reviews/，SessionStart 将自动加载最近几次记录。",
].filter(Boolean).join("\n");

const dateStr = new Date().toISOString().slice(0, 10).replace(/:/g, "-");
writeFileSync(join(reviewsDir, `${dateStr}.md`), report, "utf-8");
