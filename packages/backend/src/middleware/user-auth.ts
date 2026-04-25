import type { FastifyReply, FastifyRequest } from 'fastify';

import { verifyAccess } from '../lib/jwt.js';

export interface AuthenticatedRequest extends FastifyRequest {
  userId: string;
}

export async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;

  if (!auth?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'missing_token' });
  }

  try {
    const payload = verifyAccess(auth.slice(7));
    (request as AuthenticatedRequest).userId = payload.sub;
  } catch {
    return reply.code(401).send({ error: 'invalid_token' });
  }
}
