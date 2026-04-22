import { createId } from '@paralleldrive/cuid2';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { agentRuns, runners } from '../db/schema/runners.js';
import { getRedis } from '../lib/redis.js';

const registerSchema = z.object({
  registration_token: z.string().min(16),
  machine_id: z.string().min(1),
  capabilities: z.array(z.string()),
});

export const runnerRoutes: FastifyPluginAsync = async (app) => {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_registration_token' });
    }

    const redis = getRedis();
    const tokenKey = `runner:reg:${parsed.data.registration_token}`;
    const storedToken = await redis.get(tokenKey);

    if (!storedToken) {
      return reply.code(400).send({ error: 'invalid_registration_token' });
    }

    await redis.del(tokenKey);

    const { workspaceId } = JSON.parse(storedToken) as { workspaceId: string };
    const runnerSecret = `${createId()}${createId()}`;
    const secretHash = await bcrypt.hash(runnerSecret, 10);

    const [runner] = await db
      .insert(runners)
      .values({
        workspaceId,
        machineId: parsed.data.machine_id,
        secretHash,
        capabilities: parsed.data.capabilities,
        status: 'online',
        lastHeartbeatAt: new Date(),
      })
      .returning();

    return { data: { runner_id: runner.id, runner_secret: runnerSecret } };
  });

  app.get('/:runnerId/tasks/claim', async (request, reply) => {
    const { runnerId } = request.params as { runnerId: string };
    const query = request.query as { timeout?: string };
    const timeoutSeconds = Math.min(Number.parseInt(query.timeout ?? '25', 10), 30);
    const redis = getRedis();
    const task = await redis.brpop(`runner:queue:${runnerId}`, timeoutSeconds);

    if (!task) {
      return reply.code(204).send();
    }

    const agentRunId = task[1];
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId),
    });

    if (!agentRun) {
      return reply.code(204).send();
    }

    const [updated] = await db
      .update(agentRuns)
      .set({ runnerId, status: 'running', updatedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId))
      .returning();

    return { data: updated };
  });

  app.post('/agent-runs/:agentRunId/heartbeat', async (request) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { checkpoint_data?: Record<string, unknown> };

    await db
      .update(agentRuns)
      .set({
        lastHeartbeatAt: new Date(),
        checkpointData: body.checkpoint_data ?? {},
        updatedAt: new Date(),
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
        outputPayloadRef: { artifact_ids: body.output_artifact_ids ?? [] },
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
