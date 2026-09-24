<div align="center">

# Harness Starter

A lightweight, controllable **AI Agent Harness Engineering** starter template.  
Equips AI coding assistants with operational safety guardrails (Hooks), unified behavior guidelines (`AGENTS.md`), and an engineering handoff workflow (HDD).

<p>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/agent-Codex%20%7C%20Claude%20Code%20%7C%20Pi%20%7C%20dsh-blue" alt="Multi-Agent">
  <img src="https://img.shields.io/badge/tests-56%20passing-brightgreen" alt="56 tests passing">
</p>

> **Agent Architecture Model**: `Agent = LLM (Compute/Brain) + Harness (Control/Chassis)`  
> Compatible with **OpenAI Codex, Claude Code, Pi Coding Agent, DeepSeek dsh, ZCode**, and other mainstream Agent runtimes.

<br>

https://github.com/k1ein-chen/Harness-Starter

</div>

---

## Key Features

- **Unified Guidelines (`AGENTS.md`)**: Encapsulates Karpathy principles, minimal code rules (YAGNI), localized surgical changes, and strict goal verification definitions as the baseline for all AI agents.
- **Handoff-Driven Development (HDD)**: Built-in `handover` skill specification. Milestone completions and daily wrap-ups archive high-fidelity engineering records (ADR / SOP / Handover) with an automated reverse index table and route summaries.
- **Operational Safety Guardrails (Hooks)**:
  - `PreToolUse`: Hardware-level physical interceptor. Deterministically blocks modifications to `.env` files and destructive commands like `rm -rf`.
  - `SessionStart`: 5ms instant cold start. Injects the latest handover route summary (includes graceful empty-repo fallback, 100% prompt cache friendly).
- **Static Health Scanner (`gc-scan.mjs`)**: Hallucination-free static code and environment scanner. Verifies rule integrity, Git status, debug residue, TODO cluster density, LSP, and TypeScript types.
- **Non-destructive Upgrades (`upgrade.mjs`)**: Version tracking mechanism (`.harness/version.json`) with `--dry-run` preview. Distinguishes custom user files from template defaults.

---

## Quick Start

### Method 1: npm Install (Recommended)

```bash
npx harness-starter              # Install in current directory
npx harness-starter /path/to/proj  # Install in target directory
npx harness-starter --force      # Overwrite existing template files
```

### Method 2: Manual Clone

```bash
# 1. Clone repository
git clone https://github.com/k1ein-chen/Harness-Starter.git /tmp/harness

# 2. Copy files to project
cp -r /tmp/harness/.agents/ /tmp/harness/.claude/ /tmp/harness/scripts/ /tmp/harness/docs/ /tmp/harness/AGENTS.md /tmp/harness/CLAUDE.md /tmp/harness/.lsp.json /path/to/your-project/

# 3. Verify health
cd /path/to/your-project && node scripts/check.mjs
```

---

## Directory Structure

```text
your-project/
├── AGENTS.md                  # Unified behavior guidelines (Codex / Claude Code / Pi / dsh)
├── CLAUDE.md                  # Claude entry facade: Declares stack + imports AGENTS.md
├── .lsp.json                  # Language Server configuration
├── .gitignore                  # Git ignore rules
│
├── docs/                      # Documentation & Deliverables Center
│   ├── handovers/             #   - HDD Engineering Handover (README.md index table)
│   └── guides/                #   - Core Engineering Guides (Maturity Roadmap / Goals / Loops)
│
├── scripts/                   # Automated Tooling (Pure Node.js standard library)
│   ├── check.mjs              # Environment & setup health check
│   ├── gc-scan.mjs            # Static health scanner
│   ├── init.mjs               # Project initializer
│   └── upgrade.mjs            # Template upgrade engine
│
├── .agents/                   # Universal Core Asset Center
│   ├── hooks/                 # Safety interceptors & context scripts
│   │   ├── pre-tool-check.mjs # Safety interceptor (.env protection & dangerous commands)
│   │   ├── session-context.mjs# Cold start breakpoint injection
│   │   ├── post-tool-check.mjs# (Optional) Auto-formatting
│   │   ├── pre-compact.mjs    # (Optional) State checkpoint before compaction
│   │   └── lib/harness-context.mjs # Shared utility functions
│   └── skills/
│       └── handover/          # Handover skill specification (ADR / SOP / Handover templates)
│
└── .claude/                   # Claude Code First-Class Adapter Layer
    ├── settings.json          # Hook routing registry
    └── skills/                # Claude native Slash commands (harness-init / harness-mode, etc.)
```

---

## Common Workflows

### 1. Task Handover and Wrap-up
Prompt your Agent:
```text
Please hand over the current task (following the .agents/skills/handover/ specification)
```
The AI will verify physical changes (`git status -s`), generate a structured handover document with route summaries in `docs/handovers/`, and update the index table automatically.

### 2. Project Health Scan
```bash
# Run local console scan
node scripts/gc-scan.mjs

# Output structured JSON
node scripts/gc-scan.mjs --json

# CI Gate Check (non-zero exit on critical findings)
node scripts/gc-scan.mjs --ci
```

### 3. Template Upgrade
```bash
# Preview changes without modifying files
node scripts/upgrade.mjs --dry-run

# Perform smart upgrade
node scripts/upgrade.mjs
```

---

<div align="center">

[中文](README.md) · MIT License

</div>
