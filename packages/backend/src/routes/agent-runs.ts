import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/index.js';
import { agentRuns } from '../db/schema/runners.js';

export const agentRunRoutes: FastifyPluginAsync = async (app) => {
  app.post('/agent-runs/:agentRunId/heartbeat', async (request) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { checkpoint_data?: Record<string, unknown> };

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

  app.post('/agent-runs/:agentRunId/complete', async (request) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { output_artifact_ids?: string[] };

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

  app.post('/agent-runs/:agentRunId/fail', async (request) => {
    const { agentRunId } = request.params as { agentRunId: string };

    await db
      .update(agentRuns)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));

    return { data: { ok: true } };
  });
};
