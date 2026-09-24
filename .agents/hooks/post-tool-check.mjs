/**
 * PostToolUse Hook — 在 Write/Edit 后自动格式化（L3 可选）
 *
 * 策略：先 check 再 write，只在格式有问题时才触发格式化。
 * 环境变量：
 *   HARNESS_POSTTOOL_FORMAT=0          — 完全禁用
 *   HARNESS_POSTTOOL_FORMAT_SKIP_PATTERNS — 逗号分隔的 glob（如 "*.md,*.json"）
 */
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");

// 环境变量控制
if (process.env.HARNESS_POSTTOOL_FORMAT === "0") process.exit(0);

const skipPatterns = (process.env.HARNESS_POSTTOOL_FORMAT_SKIP_PATTERNS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Formatter 定义：{ check: 检测路径, checkCmd: 检查命令, writeCmd: 写入命令 }
const FORMATTERS = [
  {
    check: "node_modules/.bin/prettier",
    checkCmd: (f) => `npx prettier --check "${f}"`,
    writeCmd: (f) => `npx prettier --write "${f}"`,
  },
  {
    check: ".prettierrc",
    checkCmd: (f) => `npx prettier --check "${f}"`,
    writeCmd: (f) => `npx prettier --write "${f}"`,
  },
  {
    check: "node_modules/.bin/biome",
    checkCmd: (f) => `npx biome format --check "${f}"`,
    writeCmd: (f) => `npx biome format --write "${f}"`,
  },
];

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

// 只对 Write/Edit 操作执行格式化
if ((tool === "Write" || tool === "Edit") && filePath) {
  // 检查跳过规则
  if (skipPatterns.length > 0) {
    const fileName = filePath.split("/").pop() || filePath.split("\\").pop() || filePath;
    const shouldSkip = skipPatterns.some((p) => {
      const regex = new RegExp("^" + p.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$");
      return regex.test(fileName) || regex.test(filePath);
    });
    if (shouldSkip) process.exit(0);
  }

  // 查找可用 formatter
  let formatter = null;
  for (const f of FORMATTERS) {
    if (existsSync(join(projectRoot, f.check))) {
      formatter = f;
      break;
    }
  }
  if (!formatter) process.exit(0);

  // 先 check：如果格式已正确，跳过
  try {
    execSync(formatter.checkCmd(filePath), {
      cwd: projectRoot,
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    process.exit(0);
  } catch {
    // check 失败 → 需要格式化
  }

  // 执行格式化
  try {
    execSync(formatter.writeCmd(filePath), {
      cwd: projectRoot,
      timeout: 5000,
      stdio: ["pipe", "pipe", "ignore"],
    });
    const relativePath = filePath.startsWith(projectRoot)
      ? filePath.slice(projectRoot.length + 1)
      : filePath;
    process.stderr.write(`[PostToolUse] Auto-formatted: ${relativePath}\n`);
  } catch {
    // 格式化失败不阻塞操作
  }
}

process.exit(0);
