import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/index.js';
import { agentRuns } from '../db/schema/runners.js';
import { type RunnerRequest, requireRunner } from '../middleware/runner-auth.js';

export const agentRunRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireRunner);

  app.post('/agent-runs/:agentRunId/heartbeat', async (request, reply) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { checkpoint_data?: Record<string, unknown> };
    const runnerId = (request as RunnerRequest).runnerId;
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId)
    });

    if (!agentRun || agentRun.runnerId !== runnerId) {
      return reply.code(403).send({ error: 'forbidden_runner' });
    }

    await db
      .update(agentRuns)
      .set({
        lastHeartbeatAt: new Date(),
        checkpointData: body.checkpoint_data ?? {},
        updatedAt: new Date()
      })
      .where(eq(agentRuns.id, agentRunId));

    return { data: { ok: true } };
  });

  app.post('/agent-runs/:agentRunId/complete', async (request, reply) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { output_artifact_ids?: string[] };
    const runnerId = (request as RunnerRequest).runnerId;
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId)
    });

    if (!agentRun || agentRun.runnerId !== runnerId) {
      return reply.code(403).send({ error: 'forbidden_runner' });
    }

    await db
      .update(agentRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        outputPayloadRef: { artifact_ids: body.output_artifact_ids ?? [] }
      })
      .where(eq(agentRuns.id, agentRunId));

    return { data: { ok: true } };
  });

  app.post('/agent-runs/:agentRunId/fail', async (request, reply) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const runnerId = (request as RunnerRequest).runnerId;
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId)
    });

    if (!agentRun || agentRun.runnerId !== runnerId) {
      return reply.code(403).send({ error: 'forbidden_runner' });
    }

    await db
      .update(agentRuns)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));

    return { data: { ok: true } };
  });
};
