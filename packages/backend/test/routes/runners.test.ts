import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { db } from '../../src/db/index.js';
import { agentRuns, runners } from '../../src/db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../../src/db/schema/workflows.js';
import { users } from '../../src/db/schema/users.js';
import { workspaceMembers, workspaces } from '../../src/db/schema/workspaces.js';
import { buildApp } from '../helpers/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'test-jwt-secret-minimum-32-chars';
  process.env.REFRESH_SECRET ??= 'test-refresh-secret-minimum-32-chars';
  process.env.FRONTEND_URL ??= 'http://localhost:5173';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('Runner registration', () => {
  it('POST /runners/register returns 400 without valid token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/runners/register',
      payload: {
        registration_token: 'invalid',
        machine_id: 'test',
        capabilities: [],
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /workspaces/:id/events returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces/fake/events',
    });

    expect(res.statusCode).toBe(401);
  });

  it('POST /agent-runs/:id/heartbeat rejects missing runner auth', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ githubId: `gh-${suffix}`, login: `u-${suffix}`, email: `${suffix}@example.com` })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({ slug: `ws-${suffix}`, name: `WS ${suffix}` })
      .returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
    const [run] = await db
      .insert(workflowRuns)
      .values({ workspaceId: workspace.id, triggeredById: user.id, triggerType: 'manual', status: 'running' })
      .returning();
    const [step] = await db
      .insert(workflowSteps)
      .values({ runId: run.id, position: 1, name: 'Code', ownerType: 'agent', agentRole: 'coder', status: 'running' })
      .returning();
    const [runner] = await db
      .insert(runners)
      .values({
        workspaceId: workspace.id,
        machineId: `machine-${suffix}`,
        secretHash: 'hash',
        capabilities: ['coder'],
        status: 'online'
      })
      .returning();
    const [agentRun] = await db
      .insert(agentRuns)
      .values({ stepId: step.id, runnerId: runner.id, status: 'running', agentRole: 'coder' })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-runs/${agentRun.id}/heartbeat`,
      payload: { checkpoint_data: { phase: 'testing' } }
    });

    expect(res.statusCode).toBe(401);
  });
});
