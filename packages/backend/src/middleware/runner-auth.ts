import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { runners } from '../db/schema/runners.js';

export interface RunnerRequest extends FastifyRequest {
  runnerId: string;
}

export async function requireRunner(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;

  if (!auth?.startsWith('Runner ')) {
    return reply.code(401).send({ error: 'missing_runner_auth' });
  }

  const credentials = auth.slice(7);
  const separator = credentials.indexOf(':');
  const runnerId = separator > 0 ? credentials.slice(0, separator) : '';

  if (!runnerId) {
    return reply.code(401).send({ error: 'invalid_runner_auth' });
  }

  const runner = await db.query.runners.findFirst({
    where: eq(runners.id, runnerId)
  });

  if (!runner) {
    return reply.code(401).send({ error: 'unknown_runner' });
  }

  (request as RunnerRequest).runnerId = runnerId;
}
