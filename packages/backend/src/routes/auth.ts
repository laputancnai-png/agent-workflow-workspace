import type { FastifyPluginAsync } from 'fastify';

import { signAccess, verifyRefresh } from '../lib/jwt.js';

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
};
