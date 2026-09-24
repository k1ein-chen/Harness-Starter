# 成熟度路线图

自评你当前的 Harness 工程水平，每级都是上行台阶：

| 级别 | 名称 | 具体指标 | 当前状态 |
|:---:|---|----|----|
| L0 | 裸用 | 没有 CLAUDE.md，手动提示 | — |
| L1 | 规则层 | 有 CLAUDE.md + 行为准则 + 完成 1 次完整对话 | — |
| L2 | 反馈回路 | PreToolUse + SessionStart + Stop 已激活 + 审查报告 ≥3 份 | — |
| **L3** | **自动修正** | **PostToolUse + PreCompact 已激活 + 审查报告 ≥5 份 + 0 调试残留** | **← 开箱即用** |
| **L4** | **自治系统 🔧** | **gc-scan 连续 3 次运行 0 critical + Loop 状态持续更新** | **← 组件已内置，需自行激活 loop** |
| **L5** | **循环工程 🔄** | **外循环自动调度 + Maker/Checker 分离 + 跨会话状态持久化 + 目标定义硬规则** | **← 已内置组件，需自行组装** |

## 升级路径

- **L0 → L1**：用 `npx harness-starter` 初始化项目，或手动创建 CLAUDE.md
- **L1 → L2**：确保 `.claude/settings.json` 中注册了 PreToolUse、SessionStart、Stop 三个 Hook
- **L2 → L3**：启用 PostToolUse（自动格式化）和 PreCompact（长会话保护）Hook
- **L3 → L4**：运行 `node scripts/gc-scan.mjs` 修复所有 critical 发现项，设置定时 loop
- **L4 → L5**：参考 `docs/guides/loop-templates.md` 组装自己的外循环流水线
