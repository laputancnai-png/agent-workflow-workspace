import { createHash, createHmac } from 'node:crypto';
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

describe('Runner routes', () => {
  function signRunnerAuth(runnerId: string, runnerSecret: string, body?: unknown) {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const signingKey = createHash('sha256').update(runnerSecret).digest('hex');
    const signature = createHmac('sha256', signingKey).update(payload).digest('hex');

    return `Runner ${runnerId}:${signature}`;
  }

  async function createRunnerScenario(suffix: string) {
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
    const runnerSecretA = `runner-secret-a-${suffix}`;
    const runnerSecretB = `runner-secret-b-${suffix}`;
    const [runnerA] = await db
      .insert(runners)
      .values({
        workspaceId: workspace.id,
        machineId: `machine-a-${suffix}`,
        secretHash: createHash('sha256').update(runnerSecretA).digest('hex'),
        capabilities: ['coder'],
        status: 'online'
      })
      .returning();
    const [runnerB] = await db
      .insert(runners)
      .values({
        workspaceId: workspace.id,
        machineId: `machine-b-${suffix}`,
        secretHash: createHash('sha256').update(runnerSecretB).digest('hex'),
        capabilities: ['coder'],
        status: 'online'
      })
      .returning();
    const [agentRun] = await db
      .insert(agentRuns)
      .values({ stepId: step.id, runnerId: runnerA.id, status: 'running', agentRole: 'coder' })
      .returning();

    return { runnerA, runnerB, runnerSecretA, runnerSecretB, agentRun };
  }

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
    const suffix = `missing-heartbeat-${Date.now().toString(36)}`;
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
    const runnerSecret = `runner-secret-${suffix}`;
    const [runner] = await db
      .insert(runners)
      .values({
        workspaceId: workspace.id,
        machineId: `machine-${suffix}`,
        secretHash: createHash('sha256').update(runnerSecret).digest('hex'),
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

  it('POST /agent-runs/:id/heartbeat rejects authenticated wrong runner with 403', async () => {
    const suffix = `forbid-heartbeat-${Date.now().toString(36)}`;
    const { runnerB, runnerSecretB, agentRun } = await createRunnerScenario(suffix);
    const body = { checkpoint_data: { phase: 'testing' } };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-runs/${agentRun.id}/heartbeat`,
      headers: {
        authorization: signRunnerAuth(runnerB.id, runnerSecretB, body)
      },
      payload: body
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /agent-runs/:id/complete rejects authenticated wrong runner with 403', async () => {
    const suffix = `forbid-complete-${Date.now().toString(36)}`;
    const { runnerB, runnerSecretB, agentRun } = await createRunnerScenario(suffix);
    const body = { output_artifact_ids: ['artifact-1'] };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-runs/${agentRun.id}/complete`,
      headers: {
        authorization: signRunnerAuth(runnerB.id, runnerSecretB, body)
      },
      payload: body
    });

    expect(res.statusCode).toBe(403);
  });

  it('POST /agent-runs/:id/fail rejects authenticated wrong runner with 403', async () => {
    const suffix = `forbid-fail-${Date.now().toString(36)}`;
    const { runnerB, runnerSecretB, agentRun } = await createRunnerScenario(suffix);
    const body = { reason: 'boom' };

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/agent-runs/${agentRun.id}/fail`,
      headers: {
        authorization: signRunnerAuth(runnerB.id, runnerSecretB, body)
      },
      payload: body
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /runners/:runnerId/tasks/claim rejects missing runner auth', async () => {
    const suffix = `claim-auth-${Date.now().toString(36)}`;
    const { runnerA } = await createRunnerScenario(suffix);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/runners/${runnerA.id}/tasks/claim?timeout=1`
    });

    expect(res.statusCode).toBe(401);
  });

  it('GET /runners/:runnerId/tasks/claim rejects authenticated wrong runner with 403', async () => {
    const suffix = `claim-forbid-${Date.now().toString(36)}`;
    const { runnerA, runnerB, runnerSecretB } = await createRunnerScenario(suffix);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/runners/${runnerA.id}/tasks/claim?timeout=1`,
      headers: {
        authorization: signRunnerAuth(runnerB.id, runnerSecretB)
      }
    });

    expect(res.statusCode).toBe(403);
  });

  it('GET /runners/:runnerId/tasks/claim returns 204 when authenticated runner has no queued task', async () => {
    const suffix = `claim-empty-${Date.now().toString(36)}`;
    const { runnerA, runnerSecretA } = await createRunnerScenario(suffix);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/runners/${runnerA.id}/tasks/claim?timeout=1`,
      headers: {
        authorization: signRunnerAuth(runnerA.id, runnerSecretA)
      }
    });

    expect(res.statusCode).toBe(204);
  });
});
