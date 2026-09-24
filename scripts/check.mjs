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
      return execSync(cmd, { stdio: ["pipe", "pipe", "ignore"], timeout: 3000 }).toString().trim();
    } catch {
      return "";
    }
  };

  const checks = [];

  // ── 1. 核心规则文件检查 ──────────────────

  const agentsOk = existsSync(join(root, "AGENTS.md"));
  const claudeOk = existsSync(join(root, "CLAUDE.md"));
  const ruleOk = agentsOk || claudeOk;
  checks.push({
    name: "规则规范 (AGENTS.md / CLAUDE.md)",
    ok: ruleOk,
    hint: ruleOk ? "" : "缺少 AGENTS.md 或 CLAUDE.md",
  });

  // ── 2. 运行时目录与配置 ──────────────────

  const agentsDirOk = existsSync(join(root, ".agents")) || existsSync(join(root, ".claude"));
  checks.push({
    name: "运行时目录 (.agents/ 或 .claude/)",
    ok: agentsDirOk,
    hint: agentsDirOk ? "" : "缺少 .agents/ 资产目录",
  });

  const settingsOk = existsSync(join(root, ".claude/settings.json"));
  checks.push({
    name: "settings.json",
    ok: settingsOk,
    hint: settingsOk ? "" : "缺少 .claude/settings.json（Claude Code 模式必需）",
  });

  // ── 3. Hook 文件检查 ─────────────────────

  const checkHook = (h) => {
    return existsSync(join(root, ".agents/hooks", h)) || existsSync(join(root, ".claude/hooks", h));
  };

  const coreHooks = ["pre-tool-check.mjs", "session-context.mjs"];
  for (const h of coreHooks) {
    const ok = checkHook(h);
    checks.push({ name: "hooks/" + h, ok, hint: ok ? "" : h + " 缺失" });
  }

  const optHooks = ["post-tool-check.mjs", "pre-compact.mjs"];
  for (const h of optHooks) {
    const ok = checkHook(h);
    checks.push({ name: "hooks/" + h + "（可选）", ok, hint: ok ? "" : h + " 缺失（L3 升级用）" });
  }

  // ── 4. HDD 交接中心检查 ──────────────────

  const handoverSkillOk =
    existsSync(join(root, ".agents/skills/handover/SKILL.md")) ||
    existsSync(join(root, ".claude/skills/handover/SKILL.md"));
  checks.push({
    name: "handover 交付技能",
    ok: handoverSkillOk,
    hint: handoverSkillOk ? "" : "缺少 handover 交接技能",
  });

  const handoversDirOk = existsSync(join(root, "docs/handovers/README.md"));
  checks.push({
    name: "docs/handovers/ 交付索引（可选）",
    ok: handoversDirOk,
    hint: handoversDirOk ? "" : "建议遵循 .agents/skills/handover/ 初始化首次交接文档",
  });

  // ── 5. LSP 配置 ──────────────────────────

  const lspOk = existsSync(join(root, ".lsp.json"));
  checks.push({ name: ".lsp.json", ok: lspOk, hint: lspOk ? "" : "缺少 .lsp.json" });

  // ── 6. 项目语言与 LSP 服务检查 ───────────

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

  if (hasPackageJson || detectedLanguages.length === 0) {
    const hasTsLsp = !!run("typescript-language-server --version");
    checks.push({
      name: "TypeScript LSP",
      ok: hasTsLsp,
      hint: hasTsLsp ? "" : "未安装，执行 npm install -g typescript-language-server",
    });
  }

  if (hasPyprojectToml) {
    const hasPyright = !!run("pyright-langserver --version") || !!run("pyright --version");
    checks.push({
      name: "Python LSP (pyright)",
      ok: hasPyright,
      hint: hasPyright ? "" : "未安装，执行 pip install pyright",
    });
  }

  if (hasGoMod) {
    const hasGopls = !!run("gopls version");
    checks.push({
      name: "Go LSP (gopls)",
      ok: hasGopls,
      hint: hasGopls ? "" : "未安装，执行 go install golang.org/x/tools/gopls@latest",
    });
  }

  // ── 7. npm 分发与初始化脚本 ──────────────

  const packageJsonOk = existsSync(join(root, "package.json"));
  const initScriptOk = existsSync(join(root, "scripts/init.mjs"));
  checks.push({ name: "npm 分发 (package.json)", ok: packageJsonOk, hint: packageJsonOk ? "" : "缺少 package.json" });
  checks.push({ name: "npm init 脚本", ok: initScriptOk, hint: initScriptOk ? "" : "缺少 init.mjs" });

  // ── 8. GC 扫描脚本检查 ───────────────────

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
