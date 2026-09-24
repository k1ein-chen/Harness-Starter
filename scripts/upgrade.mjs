#!/usr/bin/env node
/**
 * Harness Starter — 升级脚本
 *
 * 从 GitHub 拉取最新模板，按文件版本跟踪智能升级。
 *
 * 用法：
 *   node scripts/upgrade.mjs              # 检查并升级
 *   node scripts/upgrade.mjs --dry-run    # 仅预览变更
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const isDryRun = process.argv.includes("--dry-run");

// 从 package.json 读取仓库地址（单一配置源）
const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
const REPO = pkg.repository || "k1ein-chen/Harness-Starter";
const REF = "main";
const TMP_DIR = join(projectRoot, ".harness", ".upgrade-tmp");

// 模板文件列表 — 与 package.json "files" 字段保持一致
const TEMPLATE_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".lsp.json",
  ".gitignore",
  "package.json",
  "LICENSE",
  "scripts/check.mjs",
  "scripts/gc-scan.mjs",
  "scripts/init.mjs",
  "scripts/upgrade.mjs",
  "docs/handovers/README.md",
  "docs/guides/goal-definition-guide.md",
  "docs/guides/maturity-roadmap.md",
  "docs/guides/loop-templates.md",
  "docs/guides/extension-catalog.md",
  ".claude/settings.json",
  ".claude/skills/harness-init/SKILL.md",
  ".claude/skills/harness-mode/SKILL.md",
  ".agents/hooks/pre-tool-check.mjs",
  ".agents/hooks/session-context.mjs",
  ".agents/hooks/post-tool-check.mjs",
  ".agents/hooks/pre-compact.mjs",
  ".agents/hooks/lib/harness-context.mjs",
  ".agents/skills/handover/SKILL.md",
  ".agents/skills/handover/references/adr_template.md",
  ".agents/skills/handover/references/sop_template.md",
  ".agents/skills/handover/references/handover_template.md",
  ".github/workflows/harness-check.yml",
  "README.md",
  "README.en.md",
];

// ── 版本跟踪 ──

function readLocalVersion() {
  const modernPath = join(projectRoot, ".harness", "version.json");
  const legacyPath = join(projectRoot, ".claude", ".harness-version");
  const targetPath = existsSync(modernPath) ? modernPath : legacyPath;
  if (!existsSync(targetPath)) return null;
  try {
    return JSON.parse(readFileSync(targetPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeLocalVersion(ver) {
  const harnessDir = join(projectRoot, ".harness");
  if (!existsSync(harnessDir)) mkdirSync(harnessDir, { recursive: true });
  writeFileSync(join(harnessDir, "version.json"), JSON.stringify(ver, null, 2) + "\n", "utf-8");

  const claudeDir = join(projectRoot, ".claude");
  if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, ".harness-version"), JSON.stringify(ver, null, 2) + "\n", "utf-8");
}

console.log(`\n=== Harness Starter 升级检查${isDryRun ? " (预览模式)" : ""} ===\n`);

const localVer = readLocalVersion();
if (localVer) {
  console.log(`📌 当前版本: ${localVer.version}（安装于 ${localVer.installed?.slice(0, 10) || "未知"}）\n`);
} else {
  console.log("⚠️  未找到版本标记（.harness/version.json），将使用文件级对比\n");
}

// 1. 检查 git 可用性
try {
  execSync("git --version", { stdio: "pipe" });
} catch {
  console.log("❌ 需要 git 来拉取模板更新\n");
  process.exit(1);
}

// 2. 下载最新模板
console.log(`📥 正在拉取 ${REPO}@${REF} ...`);
try {
  const tarCmd = `git archive --format=tar --remote=https://github.com/${REPO}.git ${REF}`;
  execSync(tarCmd, { encoding: "base64", timeout: 15000, stdio: ["pipe", "pipe", "ignore"] });
} catch {
  console.log("⚠️  无法直接拉取，尝试 clone 方式 ...");
  if (existsSync(TMP_DIR)) {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {}
  }
  execSync(`git clone --depth 1 --branch ${REF} https://github.com/${REPO}.git "${TMP_DIR}"`, { stdio: "pipe" });
}
console.log("✅ 已获取最新版本\n");

// 3. 比较文件（带版本感知分类）
console.log("📋 检查模板文件差异 ...\n");

const pendingUpgrades = [];
const sourceDir = existsSync(TMP_DIR) ? TMP_DIR : null;

for (const file of TEMPLATE_FILES) {
  const localPath = join(projectRoot, file);
  const upstreamPath = sourceDir ? join(sourceDir, file) : null;

  if (!existsSync(localPath)) {
    if (upstreamPath && existsSync(upstreamPath)) {
      pendingUpgrades.push({ file, category: "upstream-new" });
    }
    continue;
  }

  if (!upstreamPath || !existsSync(upstreamPath)) {
    pendingUpgrades.push({ file, category: "locally-new" });
    continue;
  }

  const localContent = readFileSync(localPath, "utf-8");
  const upstreamContent = readFileSync(upstreamPath, "utf-8");

  if (localContent === upstreamContent) {
    continue;
  }

  const category = localVer ? "upstream-newer-modified" : "differs";
  pendingUpgrades.push({ file, category, localContent, upstreamContent });
}

if (pendingUpgrades.length === 0) {
  console.log("✅ 所有模板文件已是最新版本\n");
  cleanup();
  process.exit(0);
}

// 分类统计
const newFiles = pendingUpgrades.filter((p) => p.category === "upstream-new");
const modifiedFiles = pendingUpgrades.filter(
  (p) => p.category === "upstream-newer-modified" || p.category === "differs"
);
const localOnly = pendingUpgrades.filter((p) => p.category === "locally-new");

console.log(`发现 ${pendingUpgrades.length} 个文件变更:\n`);
if (newFiles.length > 0) {
  console.log("  🆕 新增文件:");
  for (const p of newFiles) console.log(`     ${p.file}`);
}
if (modifiedFiles.length > 0) {
  console.log("  📝 需要更新:");
  for (const p of modifiedFiles) console.log(`     ${p.file}`);
}
if (localOnly.length > 0) {
  console.log("  💡 仅本地存在（跳过）:");
  for (const p of localOnly) console.log(`     ${p.file}`);
}

if (isDryRun) {
  console.log("\n🔍 预览模式 — 未应用任何更改");
  if (modifiedFiles.length > 0) {
    console.log("\n⚠️  注意：标记为\"需要更新\"的文件可能包含你的自定义修改");
    console.log("   实际升级时会创建备份到 .harness/.upgrade-backups/\n");
  }
  cleanup();
  process.exit(0);
}

if (modifiedFiles.length > 0) {
  console.log("\n⚠️  已自定义的文件升级后可能需要手动合并冲突\n");
}

// 4. 应用更新
let updated = 0;
let skipped = 0;

for (const p of pendingUpgrades) {
  const localPath = join(projectRoot, p.file);
  const sourceDirPath = sourceDir ? join(sourceDir, p.file) : null;

  if (p.category === "locally-new") {
    console.log(`  ⏭️  跳过（仅本地）: ${p.file}`);
    skipped++;
    continue;
  }

  if (p.category === "upstream-new") {
    if (sourceDirPath && existsSync(sourceDirPath)) {
      const dir = dirname(localPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      writeFileSync(localPath, readFileSync(sourceDirPath, "utf-8"), "utf-8");
      console.log(`  ✅ 已创建: ${p.file}`);
      updated++;
    }
  } else {
    const backupPath = join(projectRoot, ".harness", ".upgrade-backups", p.file.replace(/[/\\]/g, "_"));
    if (sourceDirPath && existsSync(sourceDirPath)) {
      const backupDir = dirname(backupPath);
      if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
      writeFileSync(backupPath, p.localContent, "utf-8");
      writeFileSync(localPath, readFileSync(sourceDirPath, "utf-8"), "utf-8");
      console.log(`  ✅ 已更新: ${p.file}（备份: .harness/.upgrade-backups/）`);
      updated++;
    } else {
      console.log(`  ⏭️  跳过: ${p.file}（无法获取上游版本）`);
      skipped++;
    }
  }
}

// 5. 更新版本标记
if (updated > 0 || !localVer) {
  const newVer = {
    version: pkg.version || "1.0.0",
    installed: localVer?.installed || new Date().toISOString(),
    upgraded: new Date().toISOString(),
  };
  writeLocalVersion(newVer);
  console.log(`\n📌 版本标记已更新: ${newVer.version}`);
}

console.log(`\n📊 结果: ${updated} 已更新, ${skipped} 已跳过\n`);

if (updated > 0) {
  console.log("💡 提示：备份文件保存在 .harness/.upgrade-backups/ 目录");
  console.log("   如果遇到问题，可以从备份恢复\n");
}

cleanup();

function cleanup() {
  if (existsSync(TMP_DIR)) {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {}
  }
}
