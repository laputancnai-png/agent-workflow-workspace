import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';

import { db } from '../../src/db/index.js';
import { artifacts } from '../../src/db/schema/artifacts.js';
import { workflowRuns } from '../../src/db/schema/workflows.js';
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

describe('WorkflowRun API', () => {
  it('POST /workspaces/:id/runs returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/workspaces/fake/runs',
      payload: { template_id: 'builtin-9step' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('creates and lists runs using a workspace slug', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ githubId: `gh-run-${suffix}`, login: `run-user-${suffix}`, email: `run-${suffix}@example.com` })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({ slug: `run-ws-${suffix}`, name: `Run Workspace ${suffix}` })
      .returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });

    const token = signAccess({ sub: user.id });
    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.slug}/runs`,
      headers: { authorization: `Bearer ${token}` },
      payload: { template_id: 'builtin-9step' },
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().data.workspace_id).toBe(workspace.id);
    expect(createRes.json().data.steps).toHaveLength(9);

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspace.slug}/runs`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data[0].id).toBe(createRes.json().data.id);

    await db.delete(workflowRuns).where(eq(workflowRuns.workspaceId, workspace.id));
  });

  it('uses the workspace PRD to skip the import step when creating a run', async () => {
    const suffix = Date.now().toString(36);
    const [user] = await db
      .insert(users)
      .values({ githubId: `gh-run-prd-${suffix}`, login: `run-prd-${suffix}`, email: `run-prd-${suffix}@example.com` })
      .returning();
    const [workspace] = await db
      .insert(workspaces)
      .values({
        slug: `run-prd-${suffix}`,
        name: `Run PRD Workspace ${suffix}`,
        initialPrd: 'Persist checkout cart between page reloads.',
        preferredProvider: 'openclaw',
      })
      .returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });

    const createRes = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspace.slug}/runs`,
      headers: { authorization: `Bearer ${signAccess({ sub: user.id })}` },
      payload: { template_id: 'builtin-9step' },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().data;
    expect(created.steps[0].status).toBe('completed');
    expect(created.steps[1].status).toBe('completed');
    expect(created.steps[2].status).toBe('pending');
    expect(created.steps[1].output_artifact_ids).toHaveLength(1);

    const [prdArtifact] = await db.select().from(artifacts).where(eq(artifacts.id, created.steps[1].output_artifact_ids[0]));
    expect(prdArtifact.contentInline).toBe('Persist checkout cart between page reloads.');
    expect(prdArtifact.role).toBe('PRD');
    expect(prdArtifact.status).toBe('committed');
  });
});
