<div align="center">

# Harness Starter

A universal, lightweight, and controllable **AI Agent Harness Engineering** template.  
Empower your AI with deterministic safety belts (Hooks), a single-source-of-truth constitution (`AGENTS.md`), and an engineering handover paradigm (HDD).

<p>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
  <img src="https://img.shields.io/badge/agent-Codex%20%7C%20Claude%20Code%20%7C%20Pi%20%7C%20dsh-blue" alt="Multi-Agent">
  <img src="https://img.shields.io/badge/tests-56%20passing-brightgreen" alt="56 tests passing">
</p>

> **Modern Agent Formula**: $\text{Agent} = \text{LLM (Compute/Brain)} + \text{Harness (Control/Chassis)}$  
> Supports **OpenAI Codex, Claude Code, Pi Coding Agent, DeepSeek dsh, ZCode**, and other mainstream Agent runtimes.

<br>

https://github.com/k1ein-chen/Harness-Starter

</div>

---

## 📜 Key Features

- **📜 Single Source of Truth (`AGENTS.md`)**: Encapsulates Karpathy principles, the 6-level Simplicity Ladder (YAGNI → minimal code), Surgical Changes, and strict goal-definition rules. Recognized out-of-the-box by any modern Agent.
- **📋 HDD (Handoff-Driven Development)**: Built-in `handover` skill. Milestone completions and daily wrap-ups generate high-fidelity engineering records (ADR / SOP / Handover) with an automated reverse index table and 【🗺️ Route Summaries】.
- **🛡️ Ultra-lean Physical Safety Belts (Hooks)**:
  - `PreToolUse`: Hardware-level physical interceptor. Deterministically blocks modifications to `.env` files and destructive commands like `rm -rf`.
  - `SessionStart`: 5ms instant cold start. Injects the latest handover route summary (includes graceful empty-repo fallback, 100% prompt cache friendly).
- **🔍 8-Dimensional Deterministic GC Scanner (`gc-scan.mjs`)**: Hallucination-free static health inspector. Verifies rule integrity, Git state, debug residue, TODO cluster density, LSP, and TypeScript types.
- **📦 Intelligent Non-destructive Upgrades (`upgrade.mjs`)**: Version tracking mechanism (`.harness/version.json`) with `--dry-run` preview. Distinguishes custom user files from upstream template defaults.

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

```
your-project/
├── AGENTS.md                  # 🌟 Universal Agent Constitution (Codex/Pi/dsh/Claude)
├── CLAUDE.md                  # 🌟 Claude Facade: Declares stack + imports AGENTS.md
├── .lsp.json                  # Language Server configuration
├── .gitignore                  # Git ignore rules
│
├── docs/                      # 📚 Documentation & Deliverables Center
│   ├── handovers/             #   - HDD Engineering Handover (README.md index table)
│   └── guides/                #   - Core Engineering Guides (Maturity Roadmap / Goals / Loops)
│
├── scripts/                   # 🌟 Universal Deterministic Tooling (Pure Node.js)
│   ├── check.mjs              # Environment & setup health check
│   ├── gc-scan.mjs            # 8-dimensional GC scanner
│   ├── init.mjs               # Zero-dependency installer
│   └── upgrade.mjs            # Non-destructive template upgrade engine
│
├── .agents/                   # 🌟 Unified Core Asset Center
│   ├── hooks/                 # Physical interceptors & context scripts
│   │   ├── pre-tool-check.mjs # Safety interceptor
│   │   ├── session-context.mjs# HDD cold start router
│   │   ├── post-tool-check.mjs# (L3 optional) Auto-formatting
│   │   ├── pre-compact.mjs    # (L3 optional) Memory compaction snapshot
│   │   └── lib/harness-context.mjs # Shared context library
│   └── skills/
│       └── handover/          # HDD universal skill (ADR / SOP / Handover templates)
│
└── .claude/                   # 🔌 Claude Code First-Class Adapter Layer
    ├── settings.json          # Hook routing registry
    └── skills/                # Claude native Slash commands (harness-init / harness-mode, etc.)
```

---

<div align="center">

MIT License

</div>
