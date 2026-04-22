import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

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
});
