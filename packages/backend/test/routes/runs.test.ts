import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

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
});
