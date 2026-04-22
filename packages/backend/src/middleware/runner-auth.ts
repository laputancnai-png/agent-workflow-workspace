import type { FastifyReply, FastifyRequest } from 'fastify';

export interface RunnerRequest extends FastifyRequest {
  runnerId: string;
}

export async function requireRunner(request: FastifyRequest, reply: FastifyReply) {
  const runnerId = request.headers['x-runner-id'];

  if (typeof runnerId !== 'string' || runnerId.length === 0) {
    return reply.code(401).send({ error: 'missing_runner_auth' });
  }

  (request as RunnerRequest).runnerId = runnerId;
}
