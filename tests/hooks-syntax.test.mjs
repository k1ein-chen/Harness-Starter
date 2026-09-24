/**
 * tests/hooks-syntax.test.mjs — 对真实 Hook/脚本源码做语法检查
 *
 * 对仓库内真实 .mjs 文件跑 node --check，并保证无 Unix shell 专有语法。
 */

import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readdirSync, statSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectMjs(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMjs(full));
    } else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

const targets = [
  ...collectMjs(join(repoRoot, ".agents", "hooks")),
  ...collectMjs(join(repoRoot, ".claude", "hooks")),
  ...collectMjs(join(repoRoot, "scripts")),
].filter((p) => statSync(p).isFile());

describe("真实源码语法检查（node --check）", () => {
  it("应至少覆盖 hooks 与 scripts 下的源文件", () => {
    expect(targets.length).toBeGreaterThanOrEqual(6);
  });

  for (const file of targets) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    it(`${rel} 语法合法`, () => {
      expect(() => {
        execSync(`node --check "${file}"`, { stdio: "pipe" });
      }).not.toThrow();
    });
  }
});

describe("跨平台：源码不得依赖 Unix shell 专有语法", () => {
  const forbidden = [
    { re: /2>\/dev\/null/, label: "2>/dev/null（Windows cmd 不支持）" },
    { re: /\bls\s+[^"']*\/?\s+2>/, label: "ls + 重定向" },
    { re: /\|\s*grep\b/, label: "pipe 给 grep" },
  ];

  for (const file of targets) {
    const rel = relative(repoRoot, file).replace(/\\/g, "/");
    it(`${rel} 不含 Unix-only shell 片段`, async () => {
      const { readFileSync } = await import("fs");
      const content = readFileSync(file, "utf-8");
      for (const { re, label } of forbidden) {
        expect(re.test(content), `${rel} 含有 ${label}`).toBe(false);
      }
    });
  }
});
