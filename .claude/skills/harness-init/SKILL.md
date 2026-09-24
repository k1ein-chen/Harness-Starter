---
name: harness-init
description: Initialize this project with the Harness Engineering starter template. Detects project language, installs dependencies, and updates CLAUDE.md placeholders. Use when the user wants to set up or reset the Harness configuration.
---

# Harness Init

适用三种场景：
- **GitHub 安装**：用户说"帮我用 Harness Starter 初始化"——还没有模板文件
- **新项目**：模板刚复制过来，CLAUDE.md 含占位符
- **已有项目**：项目已经开发到一半，想加入 Harness

## Step 0：检查模板文件是否存在

检查项目根目录下是否有 `.agents/hooks/` 和 `AGENTS.md`。

### 如果不存在（GitHub 安装场景）

用户直接让 AI 安装 Harness Starter，还没有模板文件。需要：

1. 从 `package.json` 的 `repository` 字段获取仓库地址，克隆到临时目录：
   ```
   git clone https://github.com/<package.json repository>.git /tmp/harness-starter
   ```
2. 复制核心文件到项目：
   ```
   cp -r /tmp/harness-starter/.agents/  .agents/
   cp -r /tmp/harness-starter/.claude/  .claude/
   cp -r /tmp/harness-starter/docs/     docs/
   cp    /tmp/harness-starter/AGENTS.md ./
   cp    /tmp/harness-starter/CLAUDE.md ./
   cp    /tmp/harness-starter/.lsp.json ./
   cp    /tmp/harness-starter/.gitignore ./.gitignore 2>/dev/null || true
   cp -r /tmp/harness-starter/scripts/  ./scripts/ 2>/dev/null || true
   ```
3. 清理临时目录
4. 继续执行 Step 1

### 如果已存在

跳过 Step 0，直接执行 Step 1。

## Step 1: 检测项目信息

优先从已有文件自动推断，推断不到再问用户：

检查以下文件，提取项目信息：
- `package.json` → 项目名、技术栈（React/Vue/Next 等）、测试框架（jest/vitest 等）
- `pyproject.toml` → 项目名、Python 依赖
- `go.mod` → 模块名、Go 版本
- `Cargo.toml` → 项目名、Rust 依赖
- `composer.json` → PHP 项目
- `Gemfile` → Ruby 项目
- `CMakeLists.txt` → C/C++ 项目

对于多语言项目，选择主要技术栈填写。

## Step 2: 填写 CLAUDE.md

### 如果是新项目（含占位符）

用 Step 1 检测到的信息替换 CLAUDE.md 中的 `【待填写】` 占位符。
如果无法自动推断，询问用户：
- 用途：这个项目是做什么的？
- 技术栈：用什么语言/框架？
- 跑测试：用什么命令？

### 如果是已有项目（不含占位符）

检查 CLAUDE.md 是否已包含以下核心章节：
- Karpathy 原则（Think Before Coding / 消除信息差 / 讨论与执行分离 / Simplicity First / Surgical Changes / Goal-Driven Execution）
- 全局约定
- 自动审查闭环

如果缺失，补充进去。已有的内容不要覆盖。

## Step 3: Skill 路由发现

根据 Step 1 检测到的技术栈，扫描当前可用的 Skill，询问用户最常见的任务类型，生成路由表写入 CLAUDE.md。

### 3.1 扫描可用 Skill

检查以下位置，汇总所有可用 Skill：
1. `.claude/skills/` — 项目本地 Skill（如 harness-init、harness-mode）
2. `~/.claude/skills/` — 用户全局 Skill
3. 当前会话中 `[Available Skills]` 列表
4. MCP 工具列表（如果有）

### 3.2 推断任务场景

根据技术栈列出常见任务类型，例如：

| 技术栈 | 常见任务 | 可路由 Skill |
|--------|---------|-------------|
| React/Next.js | 组件开发、性能优化 | vercel-react-best-practices |
| 前端/UI | 页面/H5/幻灯片 | frontend-slides |
| Node.js/npm | 包管理、构建 | 项目已有 Skill |
| Python | 测试、格式化 | 项目已有 Skill |
| 公众号/内容 | 微信排版、写作 | wechat-article-formatter |

**原则**：只推荐当前会话中实际可用的 Skill，不要假设用户安装了某个 Skill。

### 3.3 写入路由表

在 CLAUDE.md 末尾追加一个 `# Skill 路由` 章节，格式如下：

```markdown
# Skill 路由

根据项目技术栈和任务类型，推荐以下 Skill：

| 任务类型 | Skill | 触发条件 |
|---------|-------|---------|
| React 组件开发 | vercel-react-best-practices | 涉及 .tsx / .jsx 文件修改 |
| 微信文章排版 | wechat-article-formatter-skill | 用户要求排版/发布公众号内容 |
| Harness 管理 | harness-init / harness-mode | 用户要求调整 Harness 配置 |
| [项目已有] | [skill-name] | [触发场景] |

> Agent 在遇到对应任务时，应优先调用路由表中的 Skill。
```

### 3.4 询问用户

生成路由表后，向用户确认：
- "我根据你的技术栈（XXX）推荐了这些 Skill 路由，有没有需要增减的？"
- 用户确认后写入 CLAUDE.md
- 如果用户不确定，先写入推荐的，告诉用户随时可以改

---

## Step 4: 检查 Hook 文件

检查 `.agents/hooks/` 下核心文件是否存在：
- `pre-tool-check.mjs` — 防止 AI 修改 .env / 高危命令
- `session-context.mjs` — 自动注入 git 状态 + 最新交接断点
- `post-tool-check.mjs` — （可选）自动格式化
- `pre-compact.mjs` — （可选）压缩前保存状态快照

缺失则从模板复制。已有则跳过，不要覆盖。

检查 `.claude/settings.json` 中是否注册了 Hook（PreToolUse / SessionStart 等）。
缺失则补充，已有的其他配置不要删除。

## Step 5: 检查并安装 LSP

检查 `typescript-language-server` 是否可用。
如果不可用，根据 Step 1 检测到的语言安装对应的 language server。

如果 `.lsp.json` 里的语言配置和项目不符，根据检测结果修改。

## Step 6: 检查 OpenSpec（可选）

询问用户是否需要规范驱动开发工作流。
如果用户确认：
- 安装 CLI：`npm install -g @fission-ai/openspec`
- 初始化：`openspec init`
- OpenSpec 会在 `.claude/` 下添加 commands 和 skills，不要阻止

## Step 7: 运行健康检查

执行 `node scripts/check.mjs`，向用户展示结果。
如果有失败项，逐一处理。

可选：向用户介绍 GC 扫描：
- `node scripts/gc-scan.mjs` — 手动执行 8 维度健康扫描
- 扫描结果输出或通过 CI 门禁检查

## Step 8: 完成提示

向用户说明当前 Harness 状态：
- 已启用的 Hook（PreToolUse / SessionStart）
- 已安装的依赖（LSP / OpenSpec）
- 还需要用户手动做的事（如果有）
