import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { getRedis } from '../../src/lib/redis.js';
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

describe('POST /api/v1/auth/refresh', () => {
  it('returns 401 without cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/v1/auth/login', () => {
  it('returns 503 when GITHUB_CLIENT_ID is not configured', async () => {
    const saved = process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_ID;

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/login' });

    process.env.GITHUB_CLIENT_ID = saved;
    expect(res.statusCode).toBe(503);
  });

  it('redirects to GitHub with state when GITHUB_CLIENT_ID is set', async () => {
    process.env.GITHUB_CLIENT_ID = 'test-client-id';

    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/login' });

    delete process.env.GITHUB_CLIENT_ID;
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('github.com/login/oauth/authorize');
    expect(res.headers.location).toContain('state=');
  });
});

describe('GET /api/v1/auth/callback', () => {
  it('returns 400 when state param is missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/callback?code=abc123' });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when state is not in Redis (invalid/expired)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/callback?code=abc123&state=nonexistent-state-xyz',
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is missing even if state is valid', async () => {
    const redis = getRedis();
    await redis.set('oauth:state:valid-test-state', '1', 'EX', 60);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/callback?state=valid-test-state',
    });

    expect(res.statusCode).toBe(400);
  });
});
