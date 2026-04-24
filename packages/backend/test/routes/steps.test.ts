import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { db } from '../../src/db/index.js';
import { artifacts } from '../../src/db/schema/artifacts.js';
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
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

async function seedStepFixture() {
  const suffix = Date.now().toString(36);
  const [user] = await db
    .insert(users)
    .values({ githubId: `gh-${suffix}`, login: `user-${suffix}`, email: `${suffix}@example.com` })
    .returning();
  const [workspace] = await db
    .insert(workspaces)
    .values({ slug: `ws-${suffix}`, name: `Workspace ${suffix}` })
    .returning();
  await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
  const [run] = await db
    .insert(workflowRuns)
    .values({
      workspaceId: workspace.id,
      triggeredById: user.id,
      triggerType: 'manual',
      status: 'running',
      featureBranch: `aww/${workspace.slug}/run`,
      baseCommitSha: 'abc123'
    })
    .returning();
  const [step] = await db
    .insert(workflowSteps)
    .values({
      runId: run.id,
      position: 1,
      name: 'Approve Plan',
      ownerType: 'approval_gate',
      status: 'running',
      outputArtifactRoles: ['PLAN']
    })
    .returning();
  const [artifact] = await db
    .insert(artifacts)
    .values({
      stepId: step.id,
      role: 'PLAN',
      status: 'committed',
      createdByType: 'agent',
      contentInline: '# Plan'
    })
    .returning();

  return {
    token: signAccess({ sub: user.id }),
    workspace,
    run,
    step,
    artifact
  };
}

describe('WorkflowStep routes', () => {
  it('GET /steps/:id returns step detail with artifacts', async () => {
    const fixture = await seedStepFixture();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/steps/${fixture.step.id}`,
      headers: { authorization: `Bearer ${fixture.token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe(fixture.step.id);
    expect(res.json().data.artifacts[0].id).toBe(fixture.artifact.id);
  });

  it('POST /steps/:id/take-over marks step human_owned and returns branch info', async () => {
    const fixture = await seedStepFixture();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/steps/${fixture.step.id}/take-over`,
      headers: { authorization: `Bearer ${fixture.token}` }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.feature_branch).toBe(fixture.run.featureBranch);
    expect(res.json().data.step_status).toBe('human_owned');
  });

  it('POST /steps/:id/rerun marks step retrying', async () => {
    const fixture = await seedStepFixture();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/steps/${fixture.step.id}/rerun`,
      headers: { authorization: `Bearer ${fixture.token}` },
      payload: { reason: 'retry with changes' }
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.step_status).toBe('retrying');
  });
});
