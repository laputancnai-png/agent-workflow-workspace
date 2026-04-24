import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { signAccess, signRefresh, verifyRefresh } from '../lib/jwt.js';
import { getRedis } from '../lib/redis.js';

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
}

interface GithubUser {
  id: number;
  login: string;
  email: string | null;
  avatar_url: string;
}

interface CallbackQuerystring {
  code?: string;
  state?: string;
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refresh_token;

    if (!refreshToken) {
      return reply.code(401).send({ error: 'missing_refresh_token' });
    }

    try {
      const payload = verifyRefresh(refreshToken);
      const accessToken = signAccess({ sub: payload.sub });

      return reply.send({ accessToken });
    } catch {
      return reply.code(401).send({ error: 'invalid_refresh_token' });
    }
  });

  app.get('/login', async (_request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return reply.code(503).send({ error: 'github_oauth_not_configured' });
    }

    const state = randomBytes(16).toString('hex');
    const redis = getRedis();
    await redis.set(`oauth:state:${state}`, '1', 'EX', 600);

    const backendBase = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const redirectUri = `${backendBase}/api/v1/auth/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'user:email',
      state,
    });

    return reply.redirect(302, `https://github.com/login/oauth/authorize?${params.toString()}`);
  });

  app.get<{ Querystring: CallbackQuerystring }>('/callback', async (request, reply) => {
    const { code, state } = request.query;

    if (!state) {
      return reply.code(400).send({ error: 'missing_state' });
    }

    const redis = getRedis();
    const stateKey = `oauth:state:${state}`;
    const stored = await redis.get(stateKey);
    if (!stored) {
      return reply.code(400).send({ error: 'invalid_oauth_state' });
    }
    await redis.del(stateKey);

    if (!code) {
      return reply.code(400).send({ error: 'missing_code' });
    }

    // Exchange code for GitHub access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const tokenData = (await tokenRes.json()) as GithubTokenResponse;

    if (!tokenData.access_token) {
      return reply.code(400).send({ error: 'github_token_exchange_failed' });
    }

    // Fetch GitHub user profile
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'AWW/1.0' },
    });
    const githubUser = (await userRes.json()) as GithubUser;

    // Upsert user in DB
    const [user] = await db
      .insert(users)
      .values({
        githubId: String(githubUser.id),
        login: githubUser.login,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          login: githubUser.login,
          email: githubUser.email,
          avatarUrl: githubUser.avatar_url,
          updatedAt: new Date(),
        },
      })
      .returning();

    const [refreshedUser] = await db.select().from(users).where(eq(users.id, user.id));
    const accessToken = signAccess({ sub: refreshedUser.id });
    const refreshToken = signRefresh({ sub: refreshedUser.id });

    void reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const userObj = {
      id: refreshedUser.id,
      name: refreshedUser.login,
      email: refreshedUser.email ?? '',
      preferred_language: refreshedUser.preferredLanguage,
    };
    const redirectUrl = `${frontendUrl}/oauth/callback?token=${accessToken}&user=${encodeURIComponent(JSON.stringify(userObj))}`;

    return reply.redirect(302, redirectUrl);
  });
};
