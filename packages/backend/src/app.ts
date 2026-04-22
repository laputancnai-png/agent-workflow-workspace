import 'dotenv/config';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';

import { authRoutes } from './routes/auth.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });
  await app.register(cookie);

  await app.register(authRoutes, { prefix: '/api/v1/auth' });

  return app;
}
