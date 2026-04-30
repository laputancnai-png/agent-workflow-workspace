# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agent Workflow Workspace** is a human-in-the-loop software delivery system where teams define repeatable workflows (PRD → Plan → Human Approval → Task Breakdown → Agent Implementation → Test → Agent Review → Human Final Review → PR Summary), assign steps to humans or AI agents, and maintain a complete audit trail.

Current phase: **static UI prototype** — no build system, no npm, no framework.

## Project Structure

```
agent-workflow-workspace/
├── index.html       # Complete single-file UI prototype (HTML + CSS + JS inline)
└── docs/
    └── PRD.md       # Full product requirements document (20 sections)
```

## Working with the Prototype

The entire UI lives in `index.html`. To preview it, open it directly in a browser — no server needed:

```bash
open index.html
```

There is no build step, no package manager, no compilation. All CSS and JavaScript are inline in the single HTML file.

## UI Architecture

The prototype demonstrates the full end-to-end workflow UI:

- **Left rail** — primary navigation (Workspace, Workflows, Agents, Artifacts, Settings icons)
- **Workflow panel** (left sidebar, `grid-row: 1/3`) — 9-step workflow list with step status icons and states (`done`, `active`, `pending`, `agent`, `review`)
- **Center panel** — current step detail: step brief with inputs/acceptance/human-options, agent stack sidebar, and handoff map showing all workflow nodes
- **Right panel** — human approval gate controls (Approve / Request Changes / Edit Output / Rerun / Take Over), artifact list, agent run list, decision history
- **Bottom-left** — code diff view (`code-view` with `.add`/`.remove`/`.muted`/`.file` classes, dark theme)
- **Bottom-right** — audit trail feed with colored dots (green/amber/blue)

Layout uses CSS Grid: `app-shell` is `72px nav + main`, workspace is `288px | 1fr | 340px` columns with `1fr | 268px` rows.

### CSS Design Tokens

All colors defined as CSS variables in `:root`: `--blue`, `--teal`, `--green`, `--amber`, `--red`, `--violet`, `--bg`, `--surface`, `--surface-soft`, `--ink`, `--muted`, `--line`, `--line-strong`, `--shadow`.

### Step State Classes

Step icons use: `.done` (green), `.active` (amber), `.pending` (gray), `.agent` (teal), `.review` (violet).

Agent avatars: `.planner` (blue), `.tasker` (teal), `.coder` (green), `.tester` (amber), `.reviewer` (violet).

## Core Concepts (from PRD)

- **Workspace** — persistent project area containing all artifacts, decisions, and logs
- **WorkflowStep** — has `owner_type` (human/agent/approval-gate), input/output artifact IDs, retry policy
- **Artifact** — durable output per step (plan, task list, code diff, test log, review findings, approval decision, PR description)
- **Human Step-In** — approve | reject | edit | request changes | redirect | take over
- **Agent Roles** — Planner, Task Breakdown, Coding, Test, Review, Summarizer

## MVP Workflow (9 steps)

1. Create Workspace → 2. Add PRD → 3. Generate Engineering Plan (human approval gate) → 4. Break Into Tasks (human gate) → 5. Implement Scoped Tasks → 6. Run Tests → 7. Human Final Review (approval gate) → 8. Generate PR Summary → 9. Open Pull Request

## Data Model (from PRD §14)

Key entities: `Workspace`, `WorkflowRun`, `WorkflowStep`, `Artifact`, `Decision`, `AgentRun`. See `docs/PRD.md` sections 8 and 14 for full field definitions.
