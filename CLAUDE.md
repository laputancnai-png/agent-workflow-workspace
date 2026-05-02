# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agent Workflow Workspace (AWW)** is a human-in-the-loop software delivery system where teams define repeatable workflows (PRD → Plan → Human Approval → Task Breakdown → Agent Implementation → Test → Agent Review → Human Final Review → PR Summary), assign steps to humans or AI agents, and maintain a complete audit trail.

Current phase: **full-stack monorepo** — Fastify backend, React frontend, and an embedded agent worker.

## Project Structure

```
agent-workflow-workspace/
├── packages/
│   ├── backend/    Fastify 4 + Drizzle ORM + PostgreSQL
│   │   └── src/
│   │       ├── db/schema/          Drizzle table definitions (camelCase fields)
│   │       ├── routes/             Fastify route handlers
│   │       ├── services/
│   │       │   ├── embedded-worker/  In-process agent runner (no separate daemon needed)
│   │       │   │   ├── config.ts     Env-var driven WorkerConfig
│   │       │   │   ├── index.ts      startEmbeddedWorker() / registerEmbeddedRunnerForWorkspace()
│   │       │   │   ├── runner-record.ts  Upsert/offline runner DB record
│   │       │   │   └── task-handler.ts   claimNextTask() / handleTask()
│   │       │   ├── scheduler.ts    scheduleNextStep() / requeueStep()
│   │       │   └── state-machine.ts
│   │       └── lib/                SSE relay, Redis, R2
│   ├── frontend/   React 18 + Vite + TanStack Query + Zustand
│   └── runner/     Agent executor library (imported by backend; also standalone CLI)
│       └── src/
│           ├── executor.ts         AgentExecutor — spawns dispatcher as child process
│           ├── agents/dispatcher.ts  Entry point for each agent subprocess
│           ├── repo-manager.ts     Git repo clone/pull
│           └── git-worker.ts       Feature branch management
├── docs/
│   ├── PRD.md                 Full product requirements (20 sections)
│   └── LOCAL_DEV_RUNBOOK.md   First-time setup guide
└── docker-compose.yml         PostgreSQL 16 (port 5432) + Redis 7 (port 6379)
```

## Embedded Worker (Key Architecture)

The backend runs agent tasks **in-process** — no separate runner daemon is required for self-hosted deployment.

On startup (`src/index.ts`), `startEmbeddedWorker()` is called. It:
1. Queries all existing workspaces and calls `upsertEmbeddedRunner()` for each
2. Starts a poll loop every `WORKER_POLL_INTERVAL_MS` (default 2 s)
3. For each registered runner ID, calls `claimNextTask()` → `handleTask()`

When a **new workspace is created** (`routes/workspaces.ts`), `registerEmbeddedRunnerForWorkspace()` is called automatically.

The embedded runner is visible in the UI as a regular runner with `machineId = 'embedded'` (configurable via `WORKER_MACHINE_ID`).

### Key environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_ENABLED` | `true` | Set `false` to disable embedded worker |
| `WORKER_MACHINE_ID` | `embedded` | Runner identity shown in UI |
| `WORKER_POLL_INTERVAL_MS` | `2000` | Task poll frequency |
| `ANTHROPIC_API_KEY` | — | Anthropic provider (at least one required) |
| `OPENCLAW_GATEWAY_URL` | — | OpenClaw provider |
| `REMOTE_RUNNERS_ENABLED` | `false` | Allow external runner registration via API |

See `packages/backend/.env.example` for all variables.

## Development Commands

```bash
# Install all workspace dependencies
pnpm install

# Start infrastructure (Postgres + Redis)
docker compose up -d

# Run database migrations
pnpm --filter @aww/backend db:migrate

# Start backend (port 3000) — embedded worker starts automatically
pnpm --filter @aww/backend dev

# Start frontend (port 5173)
pnpm --filter @aww/frontend dev

# Run tests
pnpm --filter @aww/backend test
pnpm --filter @aww/frontend test
pnpm --filter @aww/runner test
```

## Data Model

**Drizzle ORM returns camelCase field names** — always use camelCase in TypeScript interfaces (`contentInline`, `createdAt`, `workspaceId`). Never use snake_case for ORM results.

Key tables:
- `workspaces` — project areas
- `workspace_members` — user ↔ workspace membership (role: owner/member)
- `workflow_runs` — a running instance of the 9-step workflow
- `workflow_steps` — individual steps with `ownerType` (human/agent/approval_gate)
- `artifacts` — step outputs, stored inline ≤64KB or in R2/S3 via `blobKey`
- `runners` — registered agents (embedded or remote); tied to a `workspaceId`
- `agent_runs` — individual agent task executions with `status` (pending/running/completed/failed)
- `decisions` — human approval decisions per step

## Core Concepts

- **Workspace** — persistent project area containing all artifacts, decisions, and logs
- **WorkflowStep** — has `ownerType` (human/agent/approval_gate), input/output artifact IDs, retry policy
- **Artifact** — durable output per step (plan, task list, code diff, test log, review findings, PR description)
- **Human Step-In** — approve | reject | edit | request changes | redirect | take over
- **Agent Roles** — planner, task_breakdown, coder, tester, reviewer, summarizer

## MVP Workflow (9 steps)

1. Create Workspace → 2. Add PRD → 3. Generate Engineering Plan (human gate) → 4. Break Into Tasks (human gate) → 5. Implement Scoped Tasks → 6. Run Tests → 7. Human Final Review (approval gate) → 8. Generate PR Summary → 9. Open Pull Request

## Known Constraints

- `runners` table requires `workspaceId` (NOT NULL FK) — embedded runner is registered per workspace
- Redis is still required for SSE relay and audit stream (`xadd`/`xrevrange`) even in embedded mode
- TypeScript rootDir for backend is `src/` — cross-package imports must use runner's `exports` field
