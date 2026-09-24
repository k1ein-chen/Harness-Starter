import { readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { getHarnessState } from "./lib/harness-context.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// 读取 Harness 状态
const harnessState = getHarnessState(projectRoot) || { phase: "build", mode: "full" };
const isTweak = harnessState.mode === "tweak";
const isDesign = harnessState.phase === "design";

const input = readFileSync(0, "utf-8").trim();
if (!input) process.exit(0);

let call;
try {
  call = JSON.parse(input);
} catch {
  process.exit(0);
}

const tool = call.tool || "";
const args = call.input || {};
const filePath = args.file_path || args.path || "";

// 1. 硬拦截：禁止 AI 直接修改 .env 文件（所有模式均生效）
const PROTECTED_FILES = [/(^|\/|\\)\.env$/, /(^|\/|\\)\.env\.local$/];

if (tool === "Write" || tool === "Edit") {
  const fullPath = resolve(projectRoot, filePath || "");
  const isProtected = PROTECTED_FILES.some((p) => p.test(fullPath));

  if (isProtected) {
    const result = {
      block: true,
      reason: `🔒 安全拦截：禁止直接修改 ${filePath}。请手动编辑此文件。`,
    };
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }
}

// 2. 危险命令拦截（tweak/design 模式下放行）
if (!isTweak && !isDesign) {
  const DANGEROUS_COMMANDS = [
    { pattern: /rm -rf/, label: "rm -rf", alt: "使用 trash <file> 或 git rm <file>" },
    { pattern: /git push --force/, label: "git push --force", alt: "使用 git push --force-with-lease" },
  ];
  if (tool === "Bash" || tool === "PowerShell") {
    const matched = DANGEROUS_COMMANDS.find((d) => d.pattern.test(args.command || ""));
    if (matched) {
      process.stdout.write(
        JSON.stringify({
          block: true,
          reason: `⚠️ 安全拦截：${matched.label} 被禁用\n   → 替代方案：${matched.alt}\n   → 如需强制执行，请在终端手动输入命令\n   → 当前模式=${harnessState.mode}，切换为 tweak 模式可放行`,
        })
      );
      process.exit(0);
    }
  }
}

process.exit(0);
