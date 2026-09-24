#!/usr/bin/env node
/**
 * Harness Starter — 一键安装脚本
 *
 * 安装通用 Agent Harness 核心到目标项目。
 *
 * 用法:
 *   npx harness-starter                    # 安装到当前目录
 *   npx harness-starter /path/to/project   # 安装到指定目录
 *   npx harness-starter --force            # 覆盖已有文件
 *   node scripts/init.mjs                  # 本地运行
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateRoot = join(__dirname, "..");

const args = process.argv.slice(2);
const force = args.includes("--force");
const targetArg = args.filter((a) => a !== "--force")[0];
const target = targetArg ? resolve(targetArg) : process.cwd();

// 核心文件清单
const FILES = [
  // 1. 核心规则与配置
  { src: "AGENTS.md", dir: false },
  { src: "CLAUDE.md", dir: false },
  { src: ".lsp.json", dir: false },
  { src: ".gitignore", dir: false },

  // 2. 通用脚本
  { src: "scripts/check.mjs", dir: false },
  { src: "scripts/init.mjs", dir: false },
  { src: "scripts/gc-scan.mjs", dir: false },

  // 3. HDD 交付中心与指南
  { src: "docs/handovers/README.md", dir: false },
  { src: "docs/guides/goal-definition-guide.md", dir: false },
  { src: "docs/guides/maturity-roadmap.md", dir: false },
  { src: "docs/guides/loop-templates.md", dir: false },
  { src: "docs/guides/extension-catalog.md", dir: false },

  // 4. Hook 路由配置
  { src: ".claude/settings.json", dir: false },

  // 5. .agents 核心 Hook 与共享层
  { src: ".agents/hooks/pre-tool-check.mjs", dir: false },
  { src: ".agents/hooks/session-context.mjs", dir: false },
  { src: ".agents/hooks/lib/harness-context.mjs", dir: false },

  // 6. .agents HDD 交接技能 (ADR / SOP / Handover)
  { src: ".agents/skills/handover/SKILL.md", dir: false },
  { src: ".agents/skills/handover/references/adr_template.md", dir: false },
  { src: ".agents/skills/handover/references/sop_template.md", dir: false },
  { src: ".agents/skills/handover/references/handover_template.md", dir: false },

  // 7. 辅助向导 Skill
  { src: ".claude/skills/harness-init/SKILL.md", dir: false },
  { src: ".claude/skills/harness-mode/SKILL.md", dir: false },
];

console.log("\n=== Harness Starter 安装 ===\n");
console.log(`目标路径: ${target}\n`);

if (!existsSync(target)) {
  mkdirSync(target, { recursive: true });
  console.log("✅ 已创建目标目录");
}

let installed = 0;
let skipped = 0;

for (const { src, dir } of FILES) {
  const srcPath = join(templateRoot, src);
  const destPath = join(target, src);

  if (!existsSync(srcPath)) {
    console.log(`❌ 模板文件不存在: ${src}`);
    continue;
  }

  if (existsSync(destPath) && !force) {
    console.log(`⏭️  已存在，跳过: ${src}`);
    skipped++;
    continue;
  }

  try {
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    cpSync(srcPath, destPath, { recursive: dir });
    console.log(`✅ 已安装: ${src}`);
    installed++;
  } catch (e) {
    console.log(`❌ 安装失败: ${src} — ${e.message}`);
  }
}

// 写入版本标记
const harnessDir = join(target, ".harness");
if (!existsSync(harnessDir)) mkdirSync(harnessDir, { recursive: true });
const claudeDir = join(target, ".claude");
if (!existsSync(claudeDir)) mkdirSync(claudeDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(templateRoot, "package.json"), "utf-8"));
const versionData = JSON.stringify(
  {
    version: pkg.version || "1.0.0",
    installed: new Date().toISOString(),
  },
  null,
  2
) + "\n";

writeFileSync(join(harnessDir, "version.json"), versionData, "utf-8");
writeFileSync(join(claudeDir, ".harness-version"), versionData, "utf-8");
console.log("\n✅ 版本标记: .harness/version.json");

console.log(`\n📊 结果: ${installed} 已安装, ${skipped} 已跳过\n`);

console.log("💡 下一步:");
console.log(`   1. cd ${target === process.cwd() ? "." : target}`);
console.log("   2. 在任何 AI Agent（Codex / Claude Code / Pi / dsh）中打开项目");
console.log("   3. 自动读取 AGENTS.md 准则，阶段收工时遵循 .agents/skills/handover/ 归档\n");

if (skipped > 0) {
  console.log("💡 提示: 使用 --force 可覆盖已有文件\n");
}
