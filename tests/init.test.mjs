/**
 * tests/init.test.mjs — init.mjs 安装逻辑测试
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const initScript = join(projectRoot, "scripts", "init.mjs");

function createTempDir() {
  const dir = join(tmpdir(), "harness-init-test-" + randomUUID().slice(0, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

describe("init.mjs: 基础安装", () => {
  it("安装到空目录 → 创建核心规则、.agents 与交接体系", () => {
    const target = createTempDir();
    try {
      execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      expect(existsSync(join(target, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(target, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(target, ".agents", "hooks", "pre-tool-check.mjs"))).toBe(true);
      expect(existsSync(join(target, ".agents", "skills", "handover", "SKILL.md"))).toBe(true);
      expect(existsSync(join(target, "docs", "handovers", "README.md"))).toBe(true);
      expect(existsSync(join(target, ".claude", "settings.json"))).toBe(true);
    } finally {
      cleanup(target);
    }
  });

  it("安装后写入版本标记", () => {
    const target = createTempDir();
    try {
      execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      const verPath = join(target, ".harness", "version.json");
      expect(existsSync(verPath)).toBe(true);
      const ver = JSON.parse(readFileSync(verPath, "utf-8"));
      expect(ver).toHaveProperty("version");
      expect(ver).toHaveProperty("installed");
    } finally {
      cleanup(target);
    }
  });

  it("目标目录不存在 → 自动创建", () => {
    const parent = createTempDir();
    const target = join(parent, "nested", "project");
    try {
      execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      expect(existsSync(target)).toBe(true);
      expect(existsSync(join(target, "AGENTS.md"))).toBe(true);
    } finally {
      cleanup(parent);
    }
  });

  it("已存在的文件 → 跳过", () => {
    const target = createTempDir();
    try {
      execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      const output = execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      expect(output).toContain("已存在，跳过");
    } finally {
      cleanup(target);
    }
  });

  it("--force 覆盖已存在文件", () => {
    const target = createTempDir();
    try {
      execSync(`node "${initScript}" "${target}"`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      const output = execSync(`node "${initScript}" "${target}" --force`, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 10000,
      });
      expect(output).toContain("已安装");
    } finally {
      cleanup(target);
    }
  });
});
