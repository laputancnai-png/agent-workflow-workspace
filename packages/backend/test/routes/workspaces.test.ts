import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { db } from '../../src/db/index.js';
import { decisions } from '../../src/db/schema/decisions.js';
import { workflowRuns, workflowSteps } from '../../src/db/schema/workflows.js';
import { users } from '../../src/db/schema/users.js';
import { workspaceMembers, workspaces } from '../../src/db/schema/workspaces.js';
import { signAccess } from '../../src/lib/jwt.js';
import { buildApp } from '../helpers/app.js';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'test-jwt-secret-minimum-32-chars';
  process.env.REFRESH_SECRET ??= 'test-refresh-secret-minimum-32-chars';
  process.env.FRONTEND_URL ??= 'http://localhost:5173';
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/v1/workspaces', () => {
  it('returns 401 without bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/workspaces',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/workspaces', () => {
  it('persists the PRD and local provider settings from onboarding', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ githubId: `gh-create-ws-${suffix}`, login: `create-ws-${suffix}`, email: `create-ws-${suffix}@example.com` })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces',
      headers: { authorization: `Bearer ${signAccess({ sub: user.id })}` },
      payload: {
        name: `Create Workspace ${suffix}`,
        slug: `create-ws-${suffix}`,
        initialPrd: 'Persist cart contents during checkout.',
        preferredProvider: 'openclaw',
        preferredModel: 'openclaw-local',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.initialPrd).toBe('Persist cart contents during checkout.');
    expect(res.json().data.preferredProvider).toBe('openclaw');
    expect(res.json().data.preferredModel).toBe('openclaw-local');
  });
});

describe('DELETE /api/v1/workspaces/:id', () => {
  it('deletes a workspace that has runs, steps, and decisions', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ githubId: `gh-ws-${suffix}`, login: `ws-user-${suffix}`, email: `ws-${suffix}@example.com` })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({ slug: `delete-ws-${suffix}`, name: `Delete Workspace ${suffix}` })
      .returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
    const [run] = await db
      .insert(workflowRuns)
      .values({ workspaceId: workspace.id, triggeredById: user.id, triggerType: 'manual', status: 'running' })
      .returning();
    const [step] = await db
      .insert(workflowSteps)
      .values({ runId: run.id, position: 1, name: 'Approve Plan', ownerType: 'approval_gate', status: 'running' })
      .returning();
    await db.insert(decisions).values({ stepId: step.id, actorId: user.id, action: 'approve' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/workspaces/${workspace.id}`,
      headers: { authorization: `Bearer ${signAccess({ sub: user.id })}` },
    });

    expect(res.statusCode).toBe(204);
  });
});
