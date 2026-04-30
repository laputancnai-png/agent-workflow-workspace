# AWW Cloud Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AWW Cloud backend — a Fastify REST + SSE server with Postgres/Drizzle data layer, GitHub OAuth auth, core workflow APIs, Runner registration/task-claiming, and a Watchdog job.

**Architecture:** Fastify handles HTTP routing and SSE; Drizzle ORM owns the Postgres schema and migrations; Redis is used for pubsub (SSE fan-out) and task queue (Runner long-poll). All business logic lives in `/services`; routes are thin validation + delegation.

**Tech Stack:** Node.js 20, Fastify 4, TypeScript 5, Drizzle ORM, Postgres 16, Redis 7, Cloudflare R2 (S3-compatible), Vitest, `@fastify/jwt`, `@fastify/oauth2`

---

## File Map

```
packages/backend/
├── src/
│   ├── index.ts                    # Fastify app bootstrap + server start
│   ├── app.ts                      # Plugin registration (routes, plugins)
│   ├── db/
│   │   ├── index.ts               # Drizzle client singleton
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── workspaces.ts
│   │       ├── workflows.ts        # templates, runs, steps
│   │       ├── artifacts.ts
│   │       ├── decisions.ts
│   │       ├── runners.ts          # runners + agent_runs
│   │       └── audit.ts
│   ├── routes/
│   │   ├── auth.ts                # POST /auth/github, POST /auth/refresh
│   │   ├── workspaces.ts
│   │   ├── runs.ts
│   │   ├── steps.ts
│   │   ├── artifacts.ts
│   │   ├── decisions.ts
│   │   ├── runners.ts             # registration, task claim, heartbeat
│   │   └── events.ts              # GET /workspaces/:id/events (SSE)
│   ├── services/
│   │   ├── state-machine.ts       # WorkflowStep 8-state transitions
│   │   ├── artifact.ts            # Artifact create, commit, supersede
│   │   ├── audit.ts               # append-only audit log
│   │   └── runner.ts              # runner registration, task dispatch
│   ├── middleware/
│   │   ├── user-auth.ts           # JWT bearer verification
│   │   └── runner-auth.ts         # HMAC-signed runner requests
│   ├── lib/
│   │   ├── redis.ts               # Redis client singleton
│   │   ├── r2.ts                  # S3 client (R2/MinIO)
│   │   ├── sse.ts                 # SSE broadcaster (subscribe/publish)
│   │   └── jwt.ts                 # sign/verify helpers
│   └── jobs/
│       └── watchdog.ts            # setInterval scanning timed-out AgentRuns
├── test/
│   ├── helpers/
│   │   ├── db.ts                  # test DB setup/teardown
│   │   └── app.ts                 # build test Fastify instance
│   ├── routes/
│   │   ├── auth.test.ts
│   │   ├── workspaces.test.ts
│   │   ├── runs.test.ts
│   │   ├── steps.test.ts
│   │   ├── artifacts.test.ts
│   │   ├── decisions.test.ts
│   │   └── runners.test.ts
│   └── services/
│       ├── state-machine.test.ts
│       └── artifact.test.ts
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── .env.example
```

---

## Task 1: Monorepo + Backend Package Setup

**Files:**
- Create: `package.json` (root)
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/.env.example`

- [ ] **Step 1: Initialize pnpm workspace**

```bash
mkdir -p packages/backend/src packages/backend/test
cat > package.json << 'EOF'
{
  "name": "aww",
  "private": true,
  "workspaces": ["packages/*"],
  "engines": { "node": ">=20" }
}
EOF
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
EOF
```

- [ ] **Step 2: Create backend package.json**

```bash
cat > packages/backend/package.json << 'EOF'
{
  "name": "@aww/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/oauth2": "^8.0.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/cookie": "^9.0.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.4",
    "ioredis": "^5.3.2",
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0",
    "zod": "^3.22.0",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.11.0",
    "vitest": "^1.6.0",
    "drizzle-kit": "^0.21.0",
    "@types/node": "^20.0.0"
  }
}
EOF
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```
Save to `packages/backend/tsconfig.json`.

- [ ] **Step 4: Create .env.example**

```bash
cat > packages/backend/.env.example << 'EOF'
DATABASE_URL=postgres://aww:aww@localhost:5432/aww
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-32-chars-min
REFRESH_SECRET=change-me-32-chars-min
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY=minioadmin
R2_SECRET_KEY=minioadmin
R2_BUCKET=aww-artifacts
FRONTEND_URL=http://localhost:5173
PORT=3000
EOF
cp packages/backend/.env.example packages/backend/.env
```

- [ ] **Step 5: Install dependencies**

```bash
cd packages/backend && pnpm install
```
Expected: dependencies installed, no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: monorepo + backend package scaffold"
```

---

## Task 2: DB Client + Drizzle Config

**Files:**
- Create: `packages/backend/src/db/index.ts`
- Create: `packages/backend/drizzle.config.ts`
- Create: `packages/backend/src/db/migrate.ts`

- [ ] **Step 1: Write failing test for DB connection**

```typescript
// packages/backend/test/helpers/db.ts
import { db } from '../../src/db/index.js';
import { sql } from 'drizzle-orm';

export async function checkDbConnection() {
  return db.execute(sql`SELECT 1`);
}
```

```typescript
// packages/backend/test/routes/auth.test.ts  (seed file — will grow)
import { describe, it, expect, beforeAll } from 'vitest';
import { checkDbConnection } from '../helpers/db.js';

describe('DB', () => {
  it('connects to postgres', async () => {
    const result = await checkDbConnection();
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd packages/backend && pnpm test test/routes/auth.test.ts
```
Expected: FAIL — "Cannot find module '../../src/db/index.js'"

- [ ] **Step 3: Create DB client**

```typescript
// packages/backend/src/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as usersSchema from './schema/users.js';
import * as workspacesSchema from './schema/workspaces.js';
import * as workflowsSchema from './schema/workflows.js';
import * as artifactsSchema from './schema/artifacts.js';
import * as decisionsSchema from './schema/decisions.js';
import * as runnersSchema from './schema/runners.js';
import * as auditSchema from './schema/audit.js';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, {
  schema: {
    ...usersSchema,
    ...workspacesSchema,
    ...workflowsSchema,
    ...artifactsSchema,
    ...decisionsSchema,
    ...runnersSchema,
    ...auditSchema,
  },
});
export type DB = typeof db;
```

- [ ] **Step 4: Create drizzle.config.ts**

```typescript
// packages/backend/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 5: Create schema stubs (so DB client compiles)**

```bash
mkdir -p packages/backend/src/db/schema
for f in users workspaces workflows artifacts decisions runners audit; do
  echo "// $f schema — filled in Tasks 3–6" > packages/backend/src/db/schema/$f.ts
done
```

- [ ] **Step 6: Run test — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/auth.test.ts
```
Expected: PASS (requires local Postgres running at DATABASE_URL).

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle.config.ts
git commit -m "feat(backend): drizzle db client + config"
```

---

## Task 3: Schema — Users, Workspaces, Members

**Files:**
- Create: `packages/backend/src/db/schema/users.ts`
- Create: `packages/backend/src/db/schema/workspaces.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/services/state-machine.test.ts
import { describe, it, expect } from 'vitest';
import { users } from '../../src/db/schema/users.js';
import { workspaces } from '../../src/db/schema/workspaces.js';

describe('Schema shapes', () => {
  it('users table has required columns', () => {
    expect(users.id).toBeDefined();
    expect(users.githubId).toBeDefined();
    expect(users.email).toBeDefined();
  });
  it('workspaces table has slug column', () => {
    expect(workspaces.slug).toBeDefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```
Expected: FAIL — "users.githubId is not defined"

- [ ] **Step 3: Implement users schema**

```typescript
// packages/backend/src/db/schema/users.ts
import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';

export const users = pgTable('users', {
  id:               text('id').primaryKey().$defaultFn(() => createId()),
  githubId:         varchar('github_id', { length: 64 }).unique().notNull(),
  login:            varchar('login', { length: 128 }).notNull(),
  email:            varchar('email', { length: 256 }),
  avatarUrl:        text('avatar_url'),
  preferredLanguage:varchar('preferred_language', { length: 8 }).default('zh-CN').notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  updatedAt:        timestamp('updated_at').defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 4: Implement workspaces schema**

```typescript
// packages/backend/src/db/schema/workspaces.ts
import { pgEnum, pgTable, text, timestamp, varchar, unique } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { users } from './users.js';

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'contributor', 'reviewer', 'viewer']);

export const workspaces = pgTable('workspaces', {
  id:              text('id').primaryKey().$defaultFn(() => createId()),
  slug:            varchar('slug', { length: 64 }).unique().notNull(),
  name:            varchar('name', { length: 128 }).notNull(),
  githubRepoUrl:   text('github_repo_url'),
  defaultBranch:   varchar('default_branch', { length: 128 }).default('main').notNull(),
  preferredModel:  varchar('preferred_model', { length: 64 }).default('claude-sonnet-4-6').notNull(),
  preferredProvider: varchar('preferred_provider', { length: 32 }).default('anthropic').notNull(),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
});

export const workspaceMembers = pgTable('workspace_members', {
  id:          text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        memberRoleEnum('role').default('viewer').notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
}, t => ({ uniq: unique().on(t.workspaceId, t.userId) }));

export type Workspace = typeof workspaces.$inferSelect;
```

- [ ] **Step 5: Add @paralleldrive/cuid2**

```bash
cd packages/backend && pnpm add @paralleldrive/cuid2
```

- [ ] **Step 6: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/db/schema/users.ts packages/backend/src/db/schema/workspaces.ts
git commit -m "feat(backend/schema): users + workspaces + members"
```

---

## Task 4: Schema — Workflow Templates, Runs, Steps

**Files:**
- Create: `packages/backend/src/db/schema/workflows.ts`

- [ ] **Step 1: Write failing test**

```typescript
// append to packages/backend/test/services/state-machine.test.ts
import { workflowSteps } from '../../src/db/schema/workflows.js';

it('workflowSteps has status enum column', () => {
  expect(workflowSteps.status).toBeDefined();
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```

- [ ] **Step 3: Implement workflows schema**

```typescript
// packages/backend/src/db/schema/workflows.ts
import { pgEnum, pgTable, text, integer, timestamp, varchar, jsonb, boolean } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { workspaces } from './workspaces.js';
import { users } from './users.js';

export const stepOwnerEnum  = pgEnum('step_owner', ['human', 'agent', 'approval_gate']);
export const triggerTypeEnum = pgEnum('trigger_type', ['manual', 'webhook', 'api']);
export const runStatusEnum  = pgEnum('run_status', ['pending','running','completed','failed','cancelled']);
export const stepStatusEnum = pgEnum('step_status', [
  'pending','running','completed','failed',
  'timed_out','retrying','cancelled','human_owned',
]);

export const workflowTemplates = pgTable('workflow_templates', {
  id:          text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  stepsJson:   jsonb('steps_json').notNull(),   // step definitions array
  isBuiltIn:   boolean('is_built_in').default(false).notNull(),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

export const workflowRuns = pgTable('workflow_runs', {
  id:              text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId:     text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  templateId:      text('template_id').references(() => workflowTemplates.id),
  triggeredById:   text('triggered_by_id').references(() => users.id),
  triggerType:     triggerTypeEnum('trigger_type').default('manual').notNull(),
  status:          runStatusEnum('status').default('pending').notNull(),
  featureBranch:   varchar('feature_branch', { length: 256 }),
  baseCommitSha:   varchar('base_commit_sha', { length: 64 }),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
  updatedAt:       timestamp('updated_at').defaultNow().notNull(),
  completedAt:     timestamp('completed_at'),
});

export const workflowSteps = pgTable('workflow_steps', {
  id:                  text('id').primaryKey().$defaultFn(() => createId()),
  runId:               text('run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  position:            integer('position').notNull(),
  name:                varchar('name', { length: 128 }).notNull(),
  ownerType:           stepOwnerEnum('owner_type').notNull(),
  agentRole:           varchar('agent_role', { length: 64 }),
  status:              stepStatusEnum('status').default('pending').notNull(),
  inputArtifactRoles:  jsonb('input_artifact_roles').default([]).notNull(),
  outputArtifactRoles: jsonb('output_artifact_roles').default([]).notNull(),
  dependsOnStepIds:    jsonb('depends_on_step_ids').default([]).notNull(),
  maxRetries:          integer('max_retries').default(2).notNull(),
  retryBackoffSeconds: integer('retry_backoff_seconds').default(30).notNull(),
  executionLock:       text('execution_lock'),
  createdAt:           timestamp('created_at').defaultNow().notNull(),
  updatedAt:           timestamp('updated_at').defaultNow().notNull(),
  completedAt:         timestamp('completed_at'),
});
export type WorkflowStep = typeof workflowSteps.$inferSelect;
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/db/schema/workflows.ts
git commit -m "feat(backend/schema): workflow_templates + runs + steps"
```

---

## Task 5: Schema — Artifacts, Decisions, Runners, Agent Runs, Audit

**Files:**
- Create: `packages/backend/src/db/schema/artifacts.ts`
- Create: `packages/backend/src/db/schema/decisions.ts`
- Create: `packages/backend/src/db/schema/runners.ts`
- Create: `packages/backend/src/db/schema/audit.ts`

- [ ] **Step 1: Create artifacts schema**

```typescript
// packages/backend/src/db/schema/artifacts.ts
import { pgEnum, pgTable, text, integer, timestamp, varchar, jsonb } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { workflowSteps } from './workflows.js';

export const artifactRoleEnum = pgEnum('artifact_role', [
  'PRD','PLAN','TASK_LIST','CODE_PATCH','TEST_REPORT',
  'REVIEW_COMMENT','PR_SUMMARY','HUMAN_EDIT',
]);
export const artifactStatusEnum = pgEnum('artifact_status', ['draft','committed','superseded']);
export const artifactCreatorEnum = pgEnum('artifact_creator_type', ['human','agent','system']);

export const artifacts = pgTable('artifacts', {
  id:               text('id').primaryKey().$defaultFn(() => createId()),
  stepId:           text('step_id').references(() => workflowSteps.id),
  role:             artifactRoleEnum('role').notNull(),
  status:           artifactStatusEnum('status').default('draft').notNull(),
  parentArtifactId: text('parent_artifact_id'),
  version:          integer('version').default(1).notNull(),
  title:            varchar('title', { length: 256 }),
  contentInline:    text('content_inline'),     // small artifacts
  blobKey:          text('blob_key'),           // large: R2 object key
  gitCommitSha:     varchar('git_commit_sha', { length: 64 }),
  createdByType:    artifactCreatorEnum('created_by_type').notNull(),
  createdById:      text('created_by_id'),
  metadata:         jsonb('metadata').default({}).notNull(),
  createdAt:        timestamp('created_at').defaultNow().notNull(),
  committedAt:      timestamp('committed_at'),
});
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
```

- [ ] **Step 2: Create decisions schema**

```typescript
// packages/backend/src/db/schema/decisions.ts
import { pgEnum, pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { workflowSteps } from './workflows.js';
import { artifacts } from './artifacts.js';
import { users } from './users.js';

export const decisionActionEnum = pgEnum('decision_action', [
  'approve','reject','request_changes','edit','take_over',
]);

export const decisions = pgTable('decisions', {
  id:                 text('id').primaryKey().$defaultFn(() => createId()),
  stepId:             text('step_id').notNull().references(() => workflowSteps.id),
  actorId:            text('actor_id').references(() => users.id),
  action:             decisionActionEnum('action').notNull(),
  comment:            text('comment'),
  artifactVersionId:  text('artifact_version_id').references(() => artifacts.id),
  resultingArtifactId:text('resulting_artifact_id').references(() => artifacts.id),
  targetStepId:       text('target_step_id').references(() => workflowSteps.id),
  metadata:           jsonb('metadata').default({}).notNull(),
  createdAt:          timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 3: Create runners + agent_runs schema**

```typescript
// packages/backend/src/db/schema/runners.ts
import { pgEnum, pgTable, text, timestamp, jsonb, integer, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { workspaces } from './workspaces.js';
import { workflowSteps } from './workflows.js';

export const runnerStatusEnum  = pgEnum('runner_status', ['online','offline','draining']);
export const agentRunStatusEnum = pgEnum('agent_run_status', [
  'pending','running','completed','failed','timed_out','cancelled',
]);

export const runners = pgTable('runners', {
  id:              text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId:     text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  machineId:       varchar('machine_id', { length: 256 }).notNull(),
  secretHash:      text('secret_hash').notNull(),     // bcrypt hash of runner_secret
  status:          runnerStatusEnum('status').default('offline').notNull(),
  capabilities:    jsonb('capabilities').default([]).notNull(),
  lastHeartbeatAt: timestamp('last_heartbeat_at'),
  createdAt:       timestamp('created_at').defaultNow().notNull(),
});

export const agentRuns = pgTable('agent_runs', {
  id:                text('id').primaryKey().$defaultFn(() => createId()),
  stepId:            text('step_id').notNull().references(() => workflowSteps.id),
  runnerId:          text('runner_id').references(() => runners.id),
  status:            agentRunStatusEnum('status').default('pending').notNull(),
  agentRole:         varchar('agent_role', { length: 64 }).notNull(),
  inputPayloadRef:   jsonb('input_payload_ref').default({}).notNull(),
  outputPayloadRef:  jsonb('output_payload_ref').default({}).notNull(),
  checkpointData:    jsonb('checkpoint_data').default({}).notNull(),
  attemptNumber:     integer('attempt_number').default(1).notNull(),
  timeoutSeconds:    integer('timeout_seconds').default(600).notNull(),
  lastHeartbeatAt:   timestamp('last_heartbeat_at'),
  gitBranch:         varchar('git_branch', { length: 256 }),
  headCommitSha:     varchar('head_commit_sha', { length: 64 }),
  createdAt:         timestamp('created_at').defaultNow().notNull(),
  updatedAt:         timestamp('updated_at').defaultNow().notNull(),
  completedAt:       timestamp('completed_at'),
  cancelledAt:       timestamp('cancelled_at'),
});
export type AgentRun = typeof agentRuns.$inferSelect;
```

- [ ] **Step 4: Create audit schema**

```typescript
// packages/backend/src/db/schema/audit.ts
import { pgEnum, pgTable, text, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { createId } from '@paralleldrive/cuid2';
import { workspaces } from './workspaces.js';

export const auditActorEnum = pgEnum('audit_actor_type', ['user','agent','runner','system']);

export const auditEvents = pgTable('audit_events', {
  id:             text('id').primaryKey().$defaultFn(() => createId()),
  workspaceId:    text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  eventType:      varchar('event_type', { length: 64 }).notNull(),
  actorType:      auditActorEnum('actor_type').notNull(),
  actorId:        text('actor_id'),
  targetEntity:   varchar('target_entity', { length: 64 }),
  targetId:       text('target_id'),
  payload:        jsonb('payload').default({}).notNull(),
  selfHash:       varchar('self_hash', { length: 64 }).notNull(),
  prevHash:       varchar('prev_hash', { length: 64 }),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});
```

- [ ] **Step 5: Run DB migration to validate schema**

```bash
cd packages/backend && pnpm db:generate && pnpm db:migrate
```
Expected: Migration files generated, applied to local Postgres without error.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/db/schema/
git commit -m "feat(backend/schema): artifacts + decisions + runners + audit"
```

---

## Task 6: Fastify App + Auth (GitHub OAuth + JWT)

**Files:**
- Create: `packages/backend/src/lib/jwt.ts`
- Create: `packages/backend/src/routes/auth.ts`
- Create: `packages/backend/src/app.ts`
- Create: `packages/backend/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('POST /api/v1/auth/refresh', () => {
  it('returns 401 without cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/routes/auth.test.ts
```

- [ ] **Step 3: Create JWT helpers**

```typescript
// packages/backend/src/lib/jwt.ts
import { createSigner, createVerifier } from 'fast-jwt';

const accessSigner = createSigner({ key: process.env.JWT_SECRET!, expiresIn: '15m' });
const refreshSigner = createSigner({ key: process.env.REFRESH_SECRET!, expiresIn: '7d' });
const accessVerifier = createVerifier({ key: process.env.JWT_SECRET! });
const refreshVerifier = createVerifier({ key: process.env.REFRESH_SECRET! });

export function signAccess(payload: { sub: string; workspaceIds?: string[] }) {
  return accessSigner(payload);
}
export function signRefresh(payload: { sub: string }) {
  return refreshSigner(payload);
}
export function verifyAccess(token: string): { sub: string } {
  return accessVerifier(token);
}
export function verifyRefresh(token: string): { sub: string } {
  return refreshVerifier(token);
}
```

Add `fast-jwt`:
```bash
cd packages/backend && pnpm add fast-jwt
```

- [ ] **Step 4: Create Fastify app**

```typescript
// packages/backend/src/app.ts
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { runRoutes } from './routes/runs.js';
import { stepRoutes } from './routes/steps.js';
import { artifactRoutes } from './routes/artifacts.js';
import { decisionRoutes } from './routes/decisions.js';
import { runnerRoutes } from './routes/runners.js';
import { eventRoutes } from './routes/events.js';

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: process.env.FRONTEND_URL, credentials: true });
  await app.register(cookie, { secret: process.env.JWT_SECRET! });

  // Route prefix /api/v1
  await app.register(async (api) => {
    await api.register(authRoutes, { prefix: '/auth' });
    await api.register(workspaceRoutes, { prefix: '/workspaces' });
    await api.register(runRoutes, { prefix: '/runs' });
    await api.register(stepRoutes, { prefix: '/steps' });
    await api.register(artifactRoutes, { prefix: '/artifacts' });
    await api.register(decisionRoutes, { prefix: '/decisions' });  // POST steps/:id/decision handled here
    await api.register(runnerRoutes, { prefix: '/runners' });
    await api.register(eventRoutes, { prefix: '/workspaces' });
  }, { prefix: '/api/v1' });

  return app;
}
```

- [ ] **Step 5: Create auth route stubs**

```typescript
// packages/backend/src/routes/auth.ts
import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { eq } from 'drizzle-orm';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt.js';

export const authRoutes: FastifyPluginAsync = async (app) => {
  // GitHub OAuth callback — called after user authorizes
  app.get('/github/callback', async (req, reply) => {
    // In production: use @fastify/oauth2 to get token, fetch github user
    // For MVP stub: expects ?code= from GitHub
    reply.code(501).send({ error: 'OAuth not yet wired' });
  });

  app.post('/refresh', async (req, reply) => {
    const refreshToken = req.cookies['aww_refresh'];
    if (!refreshToken) return reply.code(401).send({ error: 'no_refresh_token' });
    try {
      const payload = verifyRefresh(refreshToken);
      const user = await db.query.users.findFirst({ where: eq(users.id, payload.sub) });
      if (!user) return reply.code(401).send({ error: 'user_not_found' });
      const access = signAccess({ sub: user.id });
      const refresh = signRefresh({ sub: user.id });
      reply.setCookie('aww_refresh', refresh, { httpOnly: true, sameSite: 'strict', maxAge: 604800 });
      return { data: { access_token: access } };
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }
  });

  app.delete('/session', async (req, reply) => {
    reply.clearCookie('aww_refresh');
    return { data: { ok: true } };
  });
};
```

- [ ] **Step 6: Create test app helper**

```typescript
// packages/backend/test/helpers/app.ts
import { buildApp } from '../../src/app.js';
export { buildApp };
```

Create stub routes so app compiles (other route files):
```bash
for r in workspaces runs steps artifacts decisions runners events; do
  echo "import type { FastifyPluginAsync } from 'fastify';
export const ${r}Routes: FastifyPluginAsync = async () => {};" > packages/backend/src/routes/$r.ts
done
```

- [ ] **Step 7: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/auth.test.ts
```
Expected: PASS (401 returned for missing cookie).

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/
git commit -m "feat(backend): fastify app + jwt auth + github oauth stub"
```

---

## Task 7: Auth Middleware + Workspace API

**Files:**
- Create: `packages/backend/src/middleware/user-auth.ts`
- Modify: `packages/backend/src/routes/workspaces.ts`
- Create: `packages/backend/test/routes/workspaces.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/workspaces.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('GET /api/v1/workspaces', () => {
  it('returns 401 without bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/routes/workspaces.test.ts
```
Expected: FAIL — returns 200 (stub), not 401.

- [ ] **Step 3: Create user auth middleware**

```typescript
// packages/backend/src/middleware/user-auth.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccess } from '../lib/jwt.js';

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return reply.code(401).send({ error: 'missing_token' });
  try {
    const payload = verifyAccess(auth.slice(7));
    (req as any).userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: 'invalid_token' });
  }
}
```

- [ ] **Step 4: Implement workspace routes**

```typescript
// packages/backend/src/routes/workspaces.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { workspaces, workspaceMembers } from '../db/schema/workspaces.js';
import { eq, and } from 'drizzle-orm';
import { requireUser } from '../middleware/user-auth.js';
import { createId } from '@paralleldrive/cuid2';

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(128),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  githubRepoUrl: z.string().url().optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/', async (req) => {
    const userId = (req as any).userId as string;
    const rows = await db
      .select({ workspace: workspaces })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(eq(workspaceMembers.userId, userId));
    return { data: rows.map(r => r.workspace) };
  });

  app.post('/', async (req, reply) => {
    const userId = (req as any).userId as string;
    const body = CreateWorkspaceSchema.parse(req.body);
    const [ws] = await db.insert(workspaces).values({ ...body }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: ws.id, userId, role: 'owner' });
    reply.code(201);
    return { data: ws };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId = (req as any).userId as string;
    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)),
    });
    if (!member) return reply.code(404).send({ error: 'not_found' });
    const ws = await db.query.workspaces.findFirst({ where: eq(workspaces.id, id) });
    return { data: ws };
  });
};
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/workspaces.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/middleware/ packages/backend/src/routes/workspaces.ts
git commit -m "feat(backend): auth middleware + workspace CRUD"
```

---

## Task 8: WorkflowRun + WorkflowStep API

**Files:**
- Modify: `packages/backend/src/routes/runs.ts`
- Modify: `packages/backend/src/routes/steps.ts`
- Create: `packages/backend/test/routes/runs.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/runs.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('WorkflowRun API', () => {
  it('POST /workspaces/:id/runs returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/workspaces/fake/runs',
      payload: { template_id: 'builtin-9step' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/routes/runs.test.ts
```

- [ ] **Step 3: Implement run routes**

```typescript
// packages/backend/src/routes/runs.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { eq, and } from 'drizzle-orm';
import { requireUser } from '../middleware/user-auth.js';
import { BUILTIN_9STEP_TEMPLATE } from '../lib/templates.js';

const CreateRunSchema = z.object({ template_id: z.string() });

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  // POST /workspaces/:workspaceId/runs  — mounted under /workspaces in app.ts
  app.post('/:workspaceId/runs', async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const userId = (req as any).userId as string;
    const body = CreateRunSchema.parse(req.body);

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    });
    if (!member || !['owner', 'admin', 'contributor'].includes(member.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [run] = await db.insert(workflowRuns).values({
      workspaceId, triggeredById: userId, triggerType: 'manual', status: 'pending',
    }).returning();

    // Insert 9 steps from builtin template
    const stepDefs = BUILTIN_9STEP_TEMPLATE.steps;
    const steps = await db.insert(workflowSteps).values(
      stepDefs.map((s: any, i: number) => ({
        runId: run.id, position: i + 1,
        name: s.name, ownerType: s.ownerType, agentRole: s.agentRole ?? null,
        inputArtifactRoles: s.inputArtifactRoles ?? [],
        outputArtifactRoles: s.outputArtifactRoles ?? [],
        dependsOnStepIds: [], maxRetries: 2, retryBackoffSeconds: 30,
      }))
    ).returning();

    reply.code(201);
    return { data: { ...run, steps } };
  });

  app.get('/:runId', async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) });
    if (!run) return reply.code(404).send({ error: 'not_found' });
    const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, runId));
    return { data: { ...run, steps } };
  });
};
```

Create the template definition:
```typescript
// packages/backend/src/lib/templates.ts
export const BUILTIN_9STEP_TEMPLATE = {
  id: 'builtin-9step',
  name: 'PRD → PR 交付流程',
  steps: [
    // ownerType: 'human' | 'agent' | 'approval_gate'
    // agentRole must match dispatcher.ts switch cases: planner|tasker|coder|tester|reviewer|summarizer
    { seq: 1, name: '创建工作区',   ownerType: 'human',        agentRole: null,          preferredProvider: null,         inputArtifactRoles: [],                                      outputArtifactRoles: [],             maxRetries: 0, retryBackoffSeconds: 0,  dependsOnStepSeqs: [] },
    { seq: 2, name: '导入 PRD',    ownerType: 'approval_gate', agentRole: null,          preferredProvider: null,         inputArtifactRoles: [],                                      outputArtifactRoles: ['PRD'],        maxRetries: 0, retryBackoffSeconds: 0,  dependsOnStepSeqs: [1] },
    { seq: 3, name: '生成工程计划', ownerType: 'agent',         agentRole: 'planner',    preferredProvider: 'anthropic',  inputArtifactRoles: ['PRD'],                                 outputArtifactRoles: ['PLAN'],       maxRetries: 2, retryBackoffSeconds: 30, dependsOnStepSeqs: [2] },
    { seq: 4, name: '拆解任务列表', ownerType: 'agent',         agentRole: 'tasker',     preferredProvider: 'anthropic',  inputArtifactRoles: ['PLAN'],                                outputArtifactRoles: ['TASK_LIST'],  maxRetries: 2, retryBackoffSeconds: 30, dependsOnStepSeqs: [3] },
    { seq: 5, name: 'Agent 实现',  ownerType: 'agent',         agentRole: 'coder',      preferredProvider: 'anthropic',  inputArtifactRoles: ['TASK_LIST'],                           outputArtifactRoles: ['CODE_PATCH'], maxRetries: 1, retryBackoffSeconds: 60, dependsOnStepSeqs: [4] },
    { seq: 6, name: '运行测试',    ownerType: 'agent',         agentRole: 'tester',     preferredProvider: 'anthropic',  inputArtifactRoles: ['CODE_PATCH'],                          outputArtifactRoles: ['TEST_REPORT'],maxRetries: 1, retryBackoffSeconds: 60, dependsOnStepSeqs: [5] },
    { seq: 7, name: '代码审查',    ownerType: 'agent',         agentRole: 'reviewer',   preferredProvider: 'anthropic',  inputArtifactRoles: ['CODE_PATCH','TEST_REPORT'],            outputArtifactRoles: ['REVIEW_COMMENT'], maxRetries: 1, retryBackoffSeconds: 30, dependsOnStepSeqs: [6] },
    { seq: 8, name: '最终人工审查', ownerType: 'approval_gate', agentRole: null,          preferredProvider: null,         inputArtifactRoles: ['REVIEW_COMMENT'],                      outputArtifactRoles: [],             maxRetries: 0, retryBackoffSeconds: 0,  dependsOnStepSeqs: [7] },
    { seq: 9, name: '生成 PR 摘要', ownerType: 'agent',         agentRole: 'summarizer', preferredProvider: 'anthropic',  inputArtifactRoles: ['CODE_PATCH','TEST_REPORT','REVIEW_COMMENT'], outputArtifactRoles: ['PR_SUMMARY'], maxRetries: 1, retryBackoffSeconds: 30, dependsOnStepSeqs: [8] },
  ],
};
```

- [ ] **Step 4: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/runs.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/runs.ts packages/backend/src/lib/templates.ts
git commit -m "feat(backend): workflow run + step creation from builtin template"
```

---

## Task 9: State Machine + Decision API

**Files:**
- Create: `packages/backend/src/services/state-machine.ts`
- Modify: `packages/backend/src/routes/decisions.ts`
- Create: `packages/backend/test/services/state-machine.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/services/state-machine.test.ts (replace earlier placeholder content)
import { describe, it, expect } from 'vitest';
import { applyDecision } from '../../src/services/state-machine.js';

describe('applyDecision', () => {
  it('approve transitions step to completed', () => {
    const result = applyDecision('running', 'approve');
    expect(result.newStepStatus).toBe('completed');
    expect(result.runEffect).toBe('advance');
  });
  it('reject transitions step to cancelled + run to failed', () => {
    const result = applyDecision('running', 'reject');
    expect(result.newStepStatus).toBe('cancelled');
    expect(result.runEffect).toBe('fail_run');
  });
  it('request_changes sets status to retrying', () => {
    const result = applyDecision('running', 'request_changes');
    expect(result.newStepStatus).toBe('retrying');
    expect(result.runEffect).toBe('requeue_step');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```

- [ ] **Step 3: Implement state machine**

```typescript
// packages/backend/src/services/state-machine.ts
import type { InferSelectModel } from 'drizzle-orm';
import type { workflowSteps } from '../db/schema/workflows.js';

type StepStatus = InferSelectModel<typeof workflowSteps>['status'];
type DecisionAction = 'approve' | 'reject' | 'request_changes' | 'edit' | 'take_over';
type RunEffect = 'advance' | 'fail_run' | 'requeue_step' | 'none';

export function applyDecision(
  currentStatus: StepStatus,
  action: DecisionAction,
): { newStepStatus: StepStatus; runEffect: RunEffect } {
  if (action === 'approve') {
    return { newStepStatus: 'completed', runEffect: 'advance' };
  }
  if (action === 'reject') {
    return { newStepStatus: 'cancelled', runEffect: 'fail_run' };
  }
  if (action === 'request_changes') {
    return { newStepStatus: 'retrying', runEffect: 'requeue_step' };
  }
  if (action === 'edit') {
    return { newStepStatus: currentStatus, runEffect: 'none' };
  }
  if (action === 'take_over') {
    return { newStepStatus: 'human_owned', runEffect: 'none' };
  }
  throw new Error(`Unknown action: ${action}`);
}

export function agentRunTimedOut(): { newStepStatus: StepStatus; runEffect: RunEffect } {
  return { newStepStatus: 'timed_out', runEffect: 'requeue_step' };
}
```

- [ ] **Step 4: Implement decision route**

```typescript
// packages/backend/src/routes/decisions.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { workflowSteps } from '../db/schema/workflows.js';
import { decisions } from '../db/schema/decisions.js';
import { eq } from 'drizzle-orm';
import { requireUser } from '../middleware/user-auth.js';
import { applyDecision } from '../services/state-machine.js';
import { publishEvent } from '../lib/sse.js';

const DecisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'edit', 'take_over']),
  comment: z.string().optional(),
  edited_artifact_id: z.string().optional(),
  target_step_id: z.string().optional(),
});

export const decisionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.post('/steps/:stepId/decision', async (req, reply) => {
    const { stepId } = req.params as { stepId: string };
    const userId = (req as any).userId as string;
    const body = DecisionSchema.parse(req.body);

    const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, stepId) });
    if (!step) return reply.code(404).send({ error: 'step_not_found' });

    const { newStepStatus, runEffect } = applyDecision(step.status, body.action);

    await db.update(workflowSteps).set({ status: newStepStatus, updatedAt: new Date() }).where(eq(workflowSteps.id, stepId));

    const [decision] = await db.insert(decisions).values({
      stepId, actorId: userId, action: body.action,
      comment: body.comment,
      artifactVersionId: body.edited_artifact_id,
      targetStepId: body.target_step_id,
    }).returning();

    // Publish SSE event
    await publishEvent('step.status_changed', { stepId, status: newStepStatus, runEffect });

    reply.code(201);
    return { data: decision };
  });
};
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/services/state-machine.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/state-machine.ts packages/backend/src/routes/decisions.ts
git commit -m "feat(backend): state machine + decision API"
```

---

## Task 10: Artifact API

**Files:**
- Modify: `packages/backend/src/routes/artifacts.ts`
- Create: `packages/backend/src/services/artifact.ts`
- Create: `packages/backend/src/lib/r2.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/artifacts.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('Artifact API', () => {
  it('GET /artifacts/:id returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/artifacts/fake-id' });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create R2 client**

```typescript
// packages/backend/src/lib/r2.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY!, secretAccessKey: process.env.R2_SECRET_KEY! },
});
const BUCKET = process.env.R2_BUCKET!;

export async function getUploadUrl(key: string, contentType = 'text/plain'): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(r2, cmd, { expiresIn: 900 });
}

export async function getDownloadUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, cmd, { expiresIn: 900 });
}
```

- [ ] **Step 4: Implement artifact routes**

```typescript
// packages/backend/src/routes/artifacts.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { eq } from 'drizzle-orm';
import { requireUser } from '../middleware/user-auth.js';
import { getUploadUrl, getDownloadUrl } from '../lib/r2.js';
import { createId } from '@paralleldrive/cuid2';

const CreateArtifactSchema = z.object({
  role: z.enum(['PRD','PLAN','TASK_LIST','CODE_PATCH','TEST_REPORT','REVIEW_COMMENT','PR_SUMMARY','HUMAN_EDIT']),
  step_id: z.string().optional(),
  parent_artifact_id: z.string().optional(),
  content_inline: z.string().optional(),    // ≤ 64KB — inline
  title: z.string().optional(),
  request_upload_url: z.boolean().optional(),
});

export const artifactRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.post('/', async (req, reply) => {
    const userId = (req as any).userId as string;
    const body = CreateArtifactSchema.parse(req.body);
    const blobKey = body.request_upload_url ? `artifacts/${createId()}` : undefined;

    const [artifact] = await db.insert(artifacts).values({
      role: body.role,
      stepId: body.step_id,
      parentArtifactId: body.parent_artifact_id,
      contentInline: body.content_inline,
      blobKey,
      title: body.title,
      createdByType: 'human',
      createdById: userId,
      status: 'draft',
    }).returning();

    const uploadUrl = blobKey ? await getUploadUrl(blobKey) : undefined;
    reply.code(201);
    return { data: artifact, upload_url: uploadUrl };
  });

  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const artifact = await db.query.artifacts.findFirst({ where: eq(artifacts.id, id) });
    if (!artifact) return reply.code(404).send({ error: 'not_found' });
    return { data: artifact };
  });

  app.get('/:id/content', async (req, reply) => {
    const { id } = req.params as { id: string };
    const artifact = await db.query.artifacts.findFirst({ where: eq(artifacts.id, id) });
    if (!artifact) return reply.code(404).send({ error: 'not_found' });
    if (artifact.contentInline) return { data: { content: artifact.contentInline } };
    if (artifact.blobKey) {
      const url = await getDownloadUrl(artifact.blobKey);
      return reply.redirect(302, url);
    }
    return reply.code(404).send({ error: 'no_content' });
  });

  app.post('/:id/commit', async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.update(artifacts).set({ status: 'committed', committedAt: new Date() }).where(eq(artifacts.id, id));
    return { data: { ok: true } };
  });
};
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/artifacts.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/artifacts.ts packages/backend/src/lib/r2.ts
git commit -m "feat(backend): artifact API + R2 presigned URLs"
```

---

## Task 11: Runner Registration + Task Claim (Long-Poll)

**Files:**
- Create: `packages/backend/src/middleware/runner-auth.ts`
- Modify: `packages/backend/src/routes/runners.ts`
- Create: `packages/backend/src/lib/redis.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/runners.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
beforeAll(async () => { app = await buildApp(); });
afterAll(async () => { await app.close(); });

describe('Runner registration', () => {
  it('POST /runners/register returns 400 without valid token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/runners/register',
      payload: { registration_token: 'invalid', machine_id: 'test', capabilities: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Create Redis client**

```typescript
// packages/backend/src/lib/redis.ts
import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL!);
  }
  return _redis;
}

export async function publishEvent(eventType: string, payload: object): Promise<void> {
  const redis = getRedis();
  const event = { event_type: eventType, payload, timestamp: new Date().toISOString() };
  // In real code, channel is workspace-scoped; simplified here
  await redis.publish('aww:events', JSON.stringify(event));
}
```

- [ ] **Step 4: Implement runner routes**

```typescript
// packages/backend/src/routes/runners.ts
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { runners, agentRuns } from '../db/schema/runners.js';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { getRedis } from '../lib/redis.js';
import bcrypt from 'bcrypt';

const RegisterSchema = z.object({
  registration_token: z.string(),
  machine_id: z.string(),
  capabilities: z.array(z.string()),
});

export const runnerRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (req, reply) => {
    const body = RegisterSchema.parse(req.body);
    const redis = getRedis();

    // Validate one-time registration token
    const storedToken = await redis.get(`runner:reg:${body.registration_token}`);
    if (!storedToken) return reply.code(400).send({ error: 'invalid_registration_token' });
    await redis.del(`runner:reg:${body.registration_token}`);

    const { workspaceId } = JSON.parse(storedToken);
    const runnerSecret = createId() + createId();  // 40+ chars
    const secretHash = await bcrypt.hash(runnerSecret, 10);

    const [runner] = await db.insert(runners).values({
      workspaceId, machineId: body.machine_id,
      secretHash, capabilities: body.capabilities, status: 'online',
      lastHeartbeatAt: new Date(),
    }).returning();

    return { data: { runner_id: runner.id, runner_secret: runnerSecret } };
  });

  // Long-poll task claim
  app.get('/:runnerId/tasks/claim', async (req, reply) => {
    const { runnerId } = req.params as { runnerId: string };
    const timeoutMs = Math.min(parseInt((req.query as any).timeout ?? '25') * 1000, 30000);
    const redis = getRedis();

    const task = await redis.brpop(`runner:queue:${runnerId}`, timeoutMs / 1000);
    if (!task) { reply.code(204); return; }

    const agentRunId = task[1];
    const agentRun = await db.query.agentRuns.findFirst({ where: eq(agentRuns.id, agentRunId) });
    if (!agentRun) { reply.code(204); return; }

    await db.update(agentRuns).set({ runnerId, status: 'running', updatedAt: new Date() }).where(eq(agentRuns.id, agentRunId));
    return { data: agentRun };
  });

  // AgentRun heartbeat
  app.post('/agent-runs/:agentRunId/heartbeat', async (req, reply) => {
    const { agentRunId } = req.params as { agentRunId: string };
    const body = req.body as { checkpoint_data?: object; progress_message?: string };
    await db.update(agentRuns).set({
      lastHeartbeatAt: new Date(),
      checkpointData: body.checkpoint_data ?? {},
      updatedAt: new Date(),
    }).where(eq(agentRuns.id, agentRunId));
    return { data: { ok: true } };
  });

  // AgentRun complete
  app.post('/agent-runs/:agentRunId/complete', async (req, reply) => {
    const { agentRunId } = req.params as { agentRunId: string };
    const body = req.body as { output_artifact_ids?: string[] };
    await db.update(agentRuns).set({
      status: 'completed', completedAt: new Date(), updatedAt: new Date(),
      outputPayloadRef: { artifact_ids: body.output_artifact_ids ?? [] },
    }).where(eq(agentRuns.id, agentRunId));
    return { data: { ok: true } };
  });

  // AgentRun fail
  app.post('/agent-runs/:agentRunId/fail', async (req, reply) => {
    const { agentRunId } = req.params as { agentRunId: string };
    const body = req.body as { error_code: string; error_message: string; retryable?: boolean };
    await db.update(agentRuns).set({
      status: 'failed', updatedAt: new Date(),
    }).where(eq(agentRuns.id, agentRunId));
    return { data: { ok: true } };
  });
};
```

Add bcrypt:
```bash
cd packages/backend && pnpm add bcrypt && pnpm add -D @types/bcrypt
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/backend && pnpm test test/routes/runners.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/runners.ts packages/backend/src/lib/redis.ts packages/backend/src/middleware/runner-auth.ts
git commit -m "feat(backend): runner registration + long-poll task claim + agent run lifecycle"
```

---

## Task 12: SSE Event Stream

**Files:**
- Create: `packages/backend/src/lib/sse.ts`
- Modify: `packages/backend/src/routes/events.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/routes/runners.test.ts — append
it('GET /workspaces/:id/events returns 401 without auth', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/fake/events' });
  expect(res.statusCode).toBe(401);
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement SSE broadcaster**

```typescript
// packages/backend/src/lib/sse.ts
import type { FastifyReply } from 'fastify';
import { getRedis } from './redis.js';
import { createId } from '@paralleldrive/cuid2';

// In-process SSE subscriber map
const subscribers = new Map<string, Set<{ id: string; reply: FastifyReply; workspaceId: string }>>();

export function addSSESubscriber(workspaceId: string, reply: FastifyReply): () => void {
  const sub = { id: createId(), reply, workspaceId };
  if (!subscribers.has(workspaceId)) subscribers.set(workspaceId, new Set());
  subscribers.get(workspaceId)!.add(sub);
  return () => subscribers.get(workspaceId)?.delete(sub);
}

export async function publishEvent(eventType: string, payload: object, workspaceId?: string): Promise<void> {
  const redis = getRedis();
  const event = { event_id: createId(), event_type: eventType, workspace_id: workspaceId, payload, timestamp: new Date().toISOString() };
  const channel = workspaceId ? `aww:ws:${workspaceId}` : 'aww:events';
  await redis.publish(channel, JSON.stringify(event));
}

// Start Redis subscriber (call once at app startup)
export function startSSERelay() {
  const sub = getRedis().duplicate();
  sub.psubscribe('aww:ws:*');
  sub.on('pmessage', (_pattern, channel, message) => {
    const workspaceId = channel.replace('aww:ws:', '');
    const subs = subscribers.get(workspaceId);
    if (!subs) return;
    for (const s of subs) {
      try { s.reply.raw.write(`data: ${message}\n\n`); } catch { /* closed */ }
    }
  });
}
```

- [ ] **Step 4: Implement SSE route**

```typescript
// packages/backend/src/routes/events.ts
import type { FastifyPluginAsync } from 'fastify';
import { requireUser } from '../middleware/user-auth.js';
import { addSSESubscriber } from '../lib/sse.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { db } from '../db/index.js';
import { and, eq } from 'drizzle-orm';

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:workspaceId/events', { preHandler: requireUser }, async (req, reply) => {
    const { workspaceId } = req.params as { workspaceId: string };
    const userId = (req as any).userId as string;

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    });
    if (!member) return reply.code(403).send({ error: 'forbidden' });

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.write(':ok\n\n');

    const unsubscribe = addSSESubscriber(workspaceId, reply);
    req.raw.on('close', unsubscribe);
    // Keep connection open — Fastify must not auto-close
    await new Promise(() => {});
  });
};
```

- [ ] **Step 5: Run — expect PASS**

```bash
cd packages/backend && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/lib/sse.ts packages/backend/src/routes/events.ts
git commit -m "feat(backend): SSE event stream + Redis pubsub relay"
```

---

## Task 13: Watchdog Job + Server Entry

**Files:**
- Create: `packages/backend/src/jobs/watchdog.ts`
- Create: `packages/backend/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/backend/test/services/state-machine.test.ts — append
import { agentRunTimedOut } from '../../src/services/state-machine.js';

it('agentRunTimedOut returns timed_out status', () => {
  const result = agentRunTimedOut();
  expect(result.newStepStatus).toBe('timed_out');
  expect(result.runEffect).toBe('requeue_step');
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement watchdog**

```typescript
// packages/backend/src/jobs/watchdog.ts
import { db } from '../db/index.js';
import { agentRuns } from '../db/schema/runners.js';
import { workflowSteps } from '../db/schema/workflows.js';
import { lt, eq, and, inArray } from 'drizzle-orm';
import { agentRunTimedOut } from '../services/state-machine.js';
import { publishEvent } from '../lib/sse.js';

const TIMEOUT_SECONDS = 120;
const SCAN_INTERVAL_MS = 30_000;

export function startWatchdog() {
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - TIMEOUT_SECONDS * 1000);
      const timedOut = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.status, 'running'), lt(agentRuns.lastHeartbeatAt, cutoff)));

      for (const run of timedOut) {
        const { newStepStatus } = agentRunTimedOut();
        await db.update(agentRuns).set({ status: 'timed_out', updatedAt: new Date() }).where(eq(agentRuns.id, run.id));
        if (run.stepId) {
          await db.update(workflowSteps).set({ status: newStepStatus, updatedAt: new Date() }).where(eq(workflowSteps.id, run.stepId));
          await publishEvent('agent_run.failed', { agentRunId: run.id, reason: 'timeout' });
        }
      }
    } catch (err) {
      console.error('[watchdog] error:', err);
    }
  }, SCAN_INTERVAL_MS);
}
```

- [ ] **Step 4: Create server entry**

```typescript
// packages/backend/src/index.ts
import 'dotenv/config';
import { buildApp } from './app.js';
import { startSSERelay } from './lib/sse.js';
import { startWatchdog } from './jobs/watchdog.js';

const app = await buildApp();
startSSERelay();
startWatchdog();

const port = parseInt(process.env.PORT ?? '3000');
await app.listen({ port, host: '0.0.0.0' });
console.log(`AWW Backend running on :${port}`);
```

- [ ] **Step 5: Run full test suite**

```bash
cd packages/backend && pnpm test
```
Expected: All tests PASS.

- [ ] **Step 6: Start dev server**

```bash
cd packages/backend && pnpm dev
```
Expected: `AWW Backend running on :3000` — no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/jobs/ packages/backend/src/index.ts
git commit -m "feat(backend): watchdog job + server entry — backend MVP complete"
```

---

*P1 Backend 完成。继续 P2 Runner：`docs/superpowers/plans/2026-04-22-aww-p2-runner.md`*
