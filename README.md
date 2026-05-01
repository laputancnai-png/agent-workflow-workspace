# AWW — Agent Workflow Workspace

A human-in-the-loop software delivery system where teams define repeatable workflows, assign steps to humans or AI agents, and maintain a complete audit trail.

**Default workflow (9 steps):**  
PRD → Engineering Plan (human gate) → Task Breakdown (human gate) → Implement → Test → Human Final Review → PR Summary → Open PR

---

## Architecture

```
packages/
├── backend/    Fastify + Drizzle ORM + PostgreSQL + Redis
├── frontend/   React + Vite + TanStack Query
└── runner/     Node.js daemon — runs LLM agents on your machine
```

Infrastructure: PostgreSQL 16 (task queue + artifacts) · Redis 7 (pubsub + SSE relay)

---

## Prerequisites

- Node.js 20+
- pnpm 10+ (`npm install -g pnpm`)
- Docker & Docker Compose (for local PostgreSQL + Redis)
- A GitHub OAuth App (for login — see below)

---

## Quick Start

For a more detailed first-time setup, startup, OAuth, smoke test, and E2E guide, see [Local Development Runbook](docs/LOCAL_DEV_RUNBOOK.md).

### 1. Clone and install

```bash
git clone https://github.com/laputancnai-png/agent-workflow-workspace.git
cd agent-workflow-workspace
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379.

### 3. Configure backend

```bash
cp packages/backend/.env.example packages/backend/.env
```

Edit `packages/backend/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Random 32+ char string — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `REFRESH_SECRET` | Another random 32+ char string |
| `GITHUB_CLIENT_ID` | From your GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | From your GitHub OAuth App |

`DATABASE_URL`, `REDIS_URL`, `PORT`, and `FRONTEND_URL` are pre-filled for local dev.

### 4. Configure frontend

```bash
cp packages/frontend/.env.example packages/frontend/.env
```

The defaults work as-is for local development (Vite proxies `/api` to `localhost:3000`).

### 5. Run database migrations

```bash
pnpm --filter @aww/backend db:migrate
```

### 6. Start development servers

```bash
# Terminal 1 — backend (port 3000)
pnpm --filter @aww/backend dev

# Terminal 2 — frontend (port 5173)
pnpm --filter @aww/frontend dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set **Homepage URL** to `http://localhost:5173`
3. Set **Authorization callback URL** to `http://localhost:3000/api/v1/auth/callback`
4. Copy **Client ID** and **Client Secret** into `packages/backend/.env`

---

## Local Runner Setup

The Runner daemon runs LLM agents on your machine and picks up tasks from the backend.

### 1. Register a runner

In the AWW UI, create a workspace and generate a registration token, then:

```bash
pnpm --filter @aww/runner dev runner:register \
  --token <registration-token> \
  --url http://localhost:3000 \
  --workspace <workspace-id>
```

This writes credentials to `~/.aww/config.toml`.

### 2. Configure LLM providers

Edit `~/.aww/config.toml` (use `packages/runner/config.example.toml` as reference):

```toml
[providers.anthropic]
api_key = "sk-ant-..."
```

At least one provider is required. Supported: `anthropic`, `openai`, `openclaw`, `hermes`.

### 3. Start the runner

```bash
pnpm --filter @aww/runner dev runner:start
```

---

## Running Tests

```bash
# All packages
pnpm --filter @aww/backend test
pnpm --filter @aww/frontend test
pnpm --filter @aww/runner test

# E2E (requires running backend + frontend)
pnpm --filter @aww/frontend exec playwright test
```

---

## Environment Variables Reference

### Backend (`packages/backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | Yes | — | Access token signing key (32+ chars) |
| `REFRESH_SECRET` | Yes | — | Refresh token signing key (32+ chars) |
| `PORT` | No | `3000` | Backend listen port |
| `HOST` | No | `0.0.0.0` | Backend listen host |
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `FRONTEND_URL` | No | — | Allowed CORS origin |
| `BACKEND_URL` | No | `http://localhost:3000` | Used to build OAuth callback URL |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth App client secret |
| `R2_ENDPOINT` | No | — | Cloudflare R2 endpoint (artifacts >64KB) |
| `R2_ACCESS_KEY` | No | — | R2 access key |
| `R2_SECRET_KEY` | No | — | R2 secret key |
| `R2_BUCKET` | No | — | R2 bucket name |

### Frontend (`packages/frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE` | No | `""` | API base URL (empty = use Vite proxy) |
| `VITE_BACKEND_URL` | No | `http://localhost:3000` | Backend URL for OAuth redirect |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 4 + Zod (fastify-type-provider-zod) |
| ORM | Drizzle ORM |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7 + SKIP LOCKED polling |
| Frontend | React 18 + Vite + TanStack Query |
| State | Zustand |
| i18n | i18next |
| Runner | Node.js + Commander CLI |
| Testing | Vitest (unit/integration) + Playwright (E2E) |
| CI | GitHub Actions |

---

## Post-MVP Roadmap

- **BullMQ task queue** — replace 5s polling for real concurrent scheduling
- **Docker sandbox** — isolate each agent run in a container
- **GitHub App integration** — Check Runs, Statuses, Webhook events
- **Parallel agent fan-out** — multiple reviewers running concurrently
