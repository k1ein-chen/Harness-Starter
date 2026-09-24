import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = join(__dirname, "..");

/**
 * 运行一次 Harness 健康检查，返回结构化结果。
 *
 * @param {string} [projectRoot] — 项目根目录
 * @returns {{ checks: Array<{name: string, ok: boolean, hint: string}>, okCount: number, criticalFails: number }}
 */
export function check(projectRoot) {
  const root = projectRoot || defaultProjectRoot;

  const run = (cmd) => {
    try {
      // stdio pipe 静默 stderr，避免依赖 Unix 重定向（Windows cmd 不支持）
      return execSync(cmd, { stdio: ["pipe", "pipe", "ignore"], timeout: 3000 }).toString().trim();
    } catch {
      return "";
    }
  };

  const checks = [];

  // ── 核心文件检查 ──────────────────────────

  const claudeOk = existsSync(join(root, "CLAUDE.md"));
  checks.push({ name: "CLAUDE.md", ok: claudeOk, hint: claudeOk ? "" : "缺少 CLAUDE.md" });

  const claudeDirOk = existsSync(join(root, ".claude"));
  checks.push({ name: ".claude/ 目录", ok: claudeDirOk, hint: claudeDirOk ? "" : "缺少 .claude/ 目录" });

  const settingsOk = existsSync(join(root, ".claude/settings.json"));
  checks.push({ name: "settings.json", ok: settingsOk, hint: settingsOk ? "" : "缺少 settings.json，Hook 无法注册" });

  // ── Hook 文件检查 ─────────────────────────

  const hooks = ["pre-tool-check.mjs", "session-context.mjs", "session-review.mjs", "post-tool-check.mjs", "pre-compact.mjs"];
  for (const h of hooks) {
    const ok = existsSync(join(root, ".claude/hooks", h));
    if (h === "post-tool-check.mjs" || h === "pre-compact.mjs") {
      checks.push({ name: "hooks/" + h + "（可选）", ok, hint: ok ? "" : h + " 缺失（L3 升级用）" });
    } else {
      checks.push({ name: "hooks/" + h, ok, hint: ok ? "" : h + " 缺失" });
    }
  }

  // PostToolUse 注册检查
  const settingsContent = settingsOk ? readFileSync(join(root, ".claude/settings.json"), "utf-8") : "";
  const postToolUseRegistered = settingsContent.includes("PostToolUse") && !settingsContent.includes("// \"PostToolUse\"");
  checks.push({ name: "PostToolUse 已注册（可选）", ok: postToolUseRegistered, hint: postToolUseRegistered ? "" : "未在 settings.json 中启用，取消注释即可" });

  // ── LSP 配置 ──────────────────────────────

  const lspOk = existsSync(join(root, ".lsp.json"));
  checks.push({ name: ".lsp.json", ok: lspOk, hint: lspOk ? "" : "缺少 .lsp.json" });

  // ── 项目类型检测 ──────────────────────────

  const hasPackageJson = existsSync(join(root, "package.json"));
  const hasPyprojectToml = existsSync(join(root, "pyproject.toml"));
  const hasGoMod = existsSync(join(root, "go.mod"));
  const hasCargoToml = existsSync(join(root, "Cargo.toml"));
  const hasGemfile = existsSync(join(root, "Gemfile"));

  const detectedLanguages = [];
  if (hasPackageJson) detectedLanguages.push("Node.js/TypeScript");
  if (hasPyprojectToml) detectedLanguages.push("Python");
  if (hasGoMod) detectedLanguages.push("Go");
  if (hasCargoToml) detectedLanguages.push("Rust");
  if (hasGemfile) detectedLanguages.push("Ruby");

  const langLabel = detectedLanguages.length > 0 ? detectedLanguages.join(", ") : "未检测到";
  checks.push({ name: "检测项目语言", ok: detectedLanguages.length > 0, hint: "已识别: " + langLabel });

  // ── 语言服务检查（按项目类型）────────────

  if (hasPackageJson) {
    const hasTsLsp = !!run("typescript-language-server --version");
    checks.push({ name: "TypeScript LSP", ok: hasTsLsp, hint: hasTsLsp ? "" : "未安装，执行 npm install -g typescript-language-server" });
  }

  if (hasPyprojectToml) {
    const hasPyright = !!run("pyright-langserver --version") || !!run("pyright --version");
    checks.push({ name: "Python LSP (pyright)", ok: hasPyright, hint: hasPyright ? "" : "未安装，执行 pip install pyright" });
  }

  if (hasGoMod) {
    const hasGopls = !!run("gopls version");
    checks.push({ name: "Go LSP (gopls)", ok: hasGopls, hint: hasGopls ? "" : "未安装，执行 go install golang.org/x/tools/gopls@latest" });
  }

  if (hasCargoToml) {
    const hasRustAnalyzer = !!run("rust-analyzer --version");
    checks.push({ name: "Rust LSP (rust-analyzer)", ok: hasRustAnalyzer, hint: hasRustAnalyzer ? "" : "未安装，参考 https://rust-analyzer.github.io/manual.html" });
  }

  // 未检测到项目类型时，默认检查 TypeScript LSP
  if (detectedLanguages.length === 0) {
    const hasTsLsp = !!run("typescript-language-server --version");
    checks.push({ name: "TypeScript LSP（默认）", ok: hasTsLsp, hint: hasTsLsp ? "" : "未安装，执行 npm install -g typescript-language-server" });
  }

  // ── Skills 检查 ──────────────────────────

  const harnessInitOk = existsSync(join(root, ".claude/skills/harness-init/SKILL.md"));
  checks.push({ name: "harness-init Skill", ok: harnessInitOk, hint: harnessInitOk ? "" : "缺少初始化 Skill" });

  const harnessModeOk = existsSync(join(root, ".claude/skills/harness-mode/SKILL.md"));
  checks.push({ name: "harness-mode Skill", ok: harnessModeOk, hint: harnessModeOk ? "" : "缺少模式切换 Skill" });

  const harnessGcOk = existsSync(join(root, ".claude/skills/harness-gc/SKILL.md"));
  checks.push({ name: "harness-gc Skill（可选）", ok: harnessGcOk, hint: harnessGcOk ? "" : "缺少 GC Agent Skill" });

  // ── npm 分发 ────────────────────────────

  const packageJsonOk = existsSync(join(root, "package.json"));
  const initScriptOk = existsSync(join(root, "scripts/init.mjs"));
  checks.push({ name: "npm 分发 (package.json)", ok: packageJsonOk, hint: packageJsonOk ? "" : "缺少 package.json" });
  checks.push({ name: "npm init 脚本", ok: initScriptOk, hint: initScriptOk ? "" : "缺少 init.mjs" });

  // ── CLAUDE.md 内容完整性 ─────────────────

  const claudeMdPath = join(root, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, "utf-8");
    if (content.includes("【待填写")) {
      checks.push({ name: "CLAUDE.md 占位符（可选）", ok: false, hint: "还有占位符未替换，首次使用请对 AI 说「帮我初始化 Harness」" });
    }
  }

  // ── GC 扫描脚本检查 ──────────────────────

  const gcScanOk = existsSync(join(root, "scripts/gc-scan.mjs"));
  checks.push({ name: "gc-scan.mjs（可选）", ok: gcScanOk, hint: gcScanOk ? "" : "缺少 GC 扫描脚本" });

  const okCount = checks.filter((c) => c.ok).length;
  const criticalFails = checks.filter((c) => !c.ok && !c.name.includes("（可选）")).length;

  return { checks, okCount, criticalFails };
}

// ═══════════════════════════════════════════════════════════════════
// CLI 入口
// ═══════════════════════════════════════════════════════════════════

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = check(defaultProjectRoot);

  console.log("\nHarness 健康检查: " + result.okCount + "/" + result.checks.length + " 通过\n");
  for (const c of result.checks) {
    const icon = c.ok ? "✅" : "❌";
    console.log("  " + icon + " " + c.name + (c.hint ? " — " + c.hint : ""));
  }
  console.log("");

  if (result.criticalFails > 0) {
    process.exit(1);
  }
}
