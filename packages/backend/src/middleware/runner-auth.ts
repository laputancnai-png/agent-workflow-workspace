import { createHmac, timingSafeEqual } from 'node:crypto';
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
  const signature = separator > 0 ? credentials.slice(separator + 1) : '';

  if (!runnerId || !signature) {
    return reply.code(401).send({ error: 'invalid_runner_auth' });
  }

  const runner = await db.query.runners.findFirst({
    where: eq(runners.id, runnerId)
  });

  if (!runner) {
    return reply.code(401).send({ error: 'unknown_runner' });
  }

  const bodyString =
    request.body === undefined || request.body === null ? '' : JSON.stringify(request.body);
  const expectedSignature = createHmac('sha256', runner.secretHash).update(bodyString).digest('hex');

  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  let signatureMatches = false;

  try {
    // HMAC-SHA256 hex digests are always 64 bytes here; catch keeps mismatched lengths on the same path.
    signatureMatches = timingSafeEqual(provided, expected);
  } catch {
    signatureMatches = false;
  }

  if (!signatureMatches) {
    return reply.code(401).send({ error: 'invalid_runner_signature' });
  }

  (request as RunnerRequest).runnerId = runnerId;
}
