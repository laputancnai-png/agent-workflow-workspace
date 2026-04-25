import 'dotenv/config';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { artifactRoutes } from './routes/artifacts.js';
import { agentRunRoutes } from './routes/agent-runs.js';
import { authRoutes } from './routes/auth.js';
import { decisionRoutes } from './routes/decisions.js';
import { eventRoutes } from './routes/events.js';
import { runRoutes } from './routes/runs.js';
import { stepRoutes } from './routes/steps.js';
import { runnerRoutes } from './routes/runners.js';
import { workspaceRoutes } from './routes/workspaces.js';

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });
  await app.register(cookie);

  await app.register(artifactRoutes, { prefix: '/api/v1/artifacts' });
  await app.register(agentRunRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(decisionRoutes, { prefix: '/api/v1' });
  await app.register(eventRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(runRoutes, { prefix: '/api/v1/workspaces' });
  await app.register(stepRoutes, { prefix: '/api/v1' });
  await app.register(runnerRoutes, { prefix: '/api/v1/runners' });
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' });

  return app;
}
