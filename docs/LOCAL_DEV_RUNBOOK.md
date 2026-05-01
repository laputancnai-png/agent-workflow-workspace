# Local Development Runbook

This guide is for a first-time local setup of Agent Workflow Workspace.

It covers:

- Required local services
- GitHub OAuth setup
- Environment files
- Startup order
- Smoke tests
- E2E tests
- Common failures

## 1. Prerequisites

Install:

- Node.js 20+
- pnpm 10+
- PostgreSQL 16
- Redis 7
- GitHub account

Docker Compose can start PostgreSQL and Redis if Docker is available:

```bash
docker compose up -d
```

If Docker is not available, start PostgreSQL and Redis however your machine provides them. The app expects:

```text
PostgreSQL: postgres://aww:aww@localhost:5432/aww
Redis:      redis://localhost:6379
```

Verify them:

```bash
psql postgres://aww:aww@localhost:5432/aww -c 'select 1;'
redis-cli -u redis://localhost:6379 ping
```

Expected Redis output:

```text
PONG
```

## 2. Install Dependencies

From the repository root:

```bash
pnpm install
```

## 3. Configure Backend

Create the backend env file:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Open `packages/backend/.env` and make sure these values exist:

```env
DATABASE_URL=postgres://aww:aww@localhost:5432/aww
REDIS_URL=redis://localhost:6379

JWT_SECRET=<random-32-plus-char-secret>
REFRESH_SECRET=<another-random-32-plus-char-secret>

PORT=3000
HOST=0.0.0.0
NODE_ENV=development

FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

ENABLE_TEST_LOGIN=true

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one value for `JWT_SECRET` and the other for `REFRESH_SECRET`.

## 4. Configure GitHub OAuth

Create a GitHub OAuth App:

1. Go to `https://github.com/settings/developers`
2. Open **OAuth Apps**
3. Click **New OAuth App**
4. Use these local development values:

```text
Application name:
AWW Local

Homepage URL:
http://localhost:5173

Authorization callback URL:
http://localhost:3000/api/v1/auth/callback
```

After creating the app, copy:

- Client ID
- Client Secret

Put them in `packages/backend/.env`:

```env
GITHUB_CLIENT_ID=<your-client-id>
GITHUB_CLIENT_SECRET=<your-client-secret>
```

Important: this project uses a GitHub **OAuth App**, not a GitHub App.

## 5. Configure Frontend

Create the frontend env file:

```bash
cp packages/frontend/.env.example packages/frontend/.env
```

For local development, this should be enough:

```env
VITE_API_BASE=
VITE_BACKEND_URL=http://localhost:3000
```

Leave `VITE_API_BASE` empty so Vite proxies `/api` to the backend.

## 6. Run Database Migrations

```bash
pnpm --filter @aww/backend db:migrate
```

## 7. Start The App

Use separate terminals.

Terminal 1, backend:

```bash
pnpm --filter @aww/backend dev
```

Expected:

```text
AWW Backend running on :3000
```

Terminal 2, frontend:

```bash
pnpm --filter @aww/frontend dev
```

Expected:

```text
Local: http://localhost:5173/
```

Open:

```text
http://localhost:5173
```

## 8. Smoke Tests

Check backend:

```bash
curl -sS http://localhost:3000/health
```

Expected:

```json
{"status":"ok"}
```

Check frontend:

```bash
curl -I http://localhost:5173/
```

Expected:

```text
HTTP/1.1 200 OK
```

Check GitHub OAuth:

```bash
curl -I http://localhost:3000/api/v1/auth/login
```

Expected when OAuth is configured:

```text
HTTP/1.1 302 Found
location: https://github.com/login/oauth/authorize...
```

Expected when OAuth is not configured:

```text
HTTP/1.1 503 Service Unavailable
```

Check test login:

```bash
curl -sS \
  -X POST http://localhost:3000/api/v1/auth/test-login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com"}'
```

Expected: JSON containing `data.access_token`.

## 9. Manual UI Check

In the browser:

1. Open `http://localhost:5173/login`
2. Click **Test Login**
3. Create a workspace:
   - Workspace name
   - Optional repo
   - PRD text
4. Click **Create Workspace**
5. Confirm the app navigates to the new workspace.

If using GitHub OAuth:

1. Open `http://localhost:5173/login`
2. Click **Login with GitHub**
3. Approve the OAuth app
4. Confirm the app redirects back to AWW.

## 10. Automated Tests

Unit and integration tests:

```bash
pnpm --filter @aww/frontend test
pnpm --filter @aww/backend test
pnpm --filter @aww/runner test
```

Production builds:

```bash
pnpm --filter @aww/frontend build
pnpm --filter @aww/backend build
pnpm --filter @aww/runner build
```

E2E tests require backend and frontend to be running:

```bash
pnpm --filter @aww/frontend exec playwright test -c e2e/playwright.config.ts
```

Expected:

```text
11 passed
```

## 11. Runner Setup

The web app and E2E tests do not require the runner daemon to be running.

The runner is only needed for real agent execution. It requires:

- A registered workspace runner
- `~/.aww/config.toml`
- At least one LLM provider key or local provider

Register a runner after creating a workspace:

```bash
pnpm --filter @aww/runner dev runner:register \
  --token <registration-token> \
  --url http://localhost:3000 \
  --workspace <workspace-id>
```

Configure a provider in `~/.aww/config.toml`, for example:

```toml
[providers.anthropic]
api_key = "sk-ant-..."
```

Start the runner:

```bash
pnpm --filter @aww/runner dev runner:start
```

Do not expect `runner:start` to work before registration and provider configuration.

## 12. Troubleshooting

### Frontend is dead

Symptom:

```text
curl: (7) Failed to connect to localhost port 5173
```

Check:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Fix:

```bash
pnpm --filter @aww/frontend dev
```

### Backend is dead

Symptom:

```text
Network Error
```

Check:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
curl -sS http://localhost:3000/health
```

Fix:

```bash
pnpm --filter @aww/backend dev
```

### Login with GitHub says OAuth is not configured

Check `packages/backend/.env`:

```env
GITHUB_CLIENT_ID=<non-empty>
GITHUB_CLIENT_SECRET=<non-empty>
BACKEND_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173
```

Then restart backend.

### GitHub redirects to the wrong place

The GitHub OAuth App callback must be exactly:

```text
http://localhost:3000/api/v1/auth/callback
```

Also verify:

```env
BACKEND_URL=http://localhost:3000
```

### Test Login returns 404

Set this in `packages/backend/.env`:

```env
ENABLE_TEST_LOGIN=true
NODE_ENV=development
```

Then restart backend.

### Create Workspace does nothing

Check backend first:

```bash
curl -sS http://localhost:3000/health
```

If backend is down, start it:

```bash
pnpm --filter @aww/backend dev
```

Then refresh the frontend and try again.

### Port already in use

Find the process:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Stop the old dev server, then restart the one you need.

## 13. Known Local Dev Notes

- `ENABLE_TEST_LOGIN=true` is for local development only.
- Real GitHub login needs `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- The frontend and backend are separate dev servers. Restarting one does not automatically restart the other.
- PostgreSQL and Redis must be running before backend startup.
- Runner startup is separate from web app startup.
