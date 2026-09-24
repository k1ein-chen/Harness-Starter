# 扩展方向

以下组件已内置在 Starter 中，按需了解和使用：

## 已激活的 Hook

- **PostToolUse 自动格式化** — 检测 prettier / biome 等工具，每次编辑后自动格式化。无对应工具时静默跳过。设置 `HARNESS_POSTTOOL_FORMAT=0` 禁用。
- **PreCompact Hook** — 上下文压缩前保存会话关键状态 + 当前任务进度。

## 进阶组件（L4+）

- **GC Agent（垃圾回收）** — `scripts/gc-scan.mjs` + `harness-gc` Skill。8 个维度确定性健康检查。
  - 使用：`node scripts/gc-scan.mjs` 或 `/loop 24h "node scripts/gc-scan.mjs"`
  - 详见：`.claude/skills/harness-gc/SKILL.md`

- **Claude Code Routines** — 将 GC Agent 部署为服务端持久任务（需 Max）。
  - 使用：`/schedule daily GC scan at 2am`

- **Worktree 隔离** — 并行 Agent 场景下用 `EnterWorktree` 隔离文件变更。
  - 详见：[Addy Osmani: Loop Engineering](https://addyosmani.com/blog/loop-engineering/)

- **Loop 场景模板** — `.claude/references/loop-templates.md` 提供三种开箱即用的外循环模板：
  1. 每日健康巡检（24h 间隔）
  2. PR 自动 babysit（30min 间隔）
  3. 自我进化循环（7 天间隔）

## 自行添加

- **PostToolUse 自动格式化** — 已内置。项目中有 prettier/biome 时自动生效。
- **PreCompact Hook** — 已内置。长会话保护。
- **自定义 Hook** — 在 `.agents/hooks/` 下创建 `.mjs` 文件，在 `settings.json` 中注册。
- **自定义 Skill** — 在 `.agents/skills/` 下创建目录 + `SKILL.md`。
- **自定义 Loop** — 参考 `loop-templates.md` 编写自己的自动化脚本。
