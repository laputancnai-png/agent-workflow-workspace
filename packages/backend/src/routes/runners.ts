import { createId } from '@paralleldrive/cuid2';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { agentRuns, runners } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaces } from '../db/schema/workspaces.js';
import { getRedis } from '../lib/redis.js';
import { publishEvent } from '../lib/sse.js';
import { type RunnerRequest, requireRunner } from '../middleware/runner-auth.js';

const registerSchema = z.object({
  registration_token: z.string().min(16),
  machine_id: z.string().min(1),
  capabilities: z.array(z.string()),
});

interface ClaimTaskParams {
  runnerId: string;
}

interface ClaimTaskQuerystring {
  timeout?: string;
}

interface AckTaskParams {
  runnerId: string;
  agentRunId: string;
}

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
    const secretHash = createHash('sha256').update(runnerSecret).digest('hex');

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

    await publishEvent(
      'runner.status_changed',
      { runner_id: runner.id, machine_id: runner.machineId, status: 'online', capabilities: runner.capabilities },
      workspaceId,
    );

    return { data: { runner_id: runner.id, runner_secret: runnerSecret } };
  });

  app.get<{ Params: ClaimTaskParams; Querystring: ClaimTaskQuerystring }>(
    '/:runnerId/tasks/claim',
    {
      preHandler: requireRunner,
      schema: {
        params: {
          type: 'object',
          required: ['runnerId'],
          properties: {
            runnerId: { type: 'string', minLength: 1 }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            timeout: { type: 'string', pattern: '^[0-9]+$' }
          }
        }
      }
    },
    async (request, reply) => {
      const { runnerId } = request.params;
      const authenticatedRunnerId = (request as RunnerRequest).runnerId;

      if (authenticatedRunnerId !== runnerId) {
        return reply.code(403).send({ error: 'forbidden_runner' });
      }

      const rawTimeout = Number.parseInt(request.query.timeout ?? '25', 10);
      const timeoutSeconds = Math.min(Number.isNaN(rawTimeout) ? 25 : rawTimeout, 30);
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

      // Resolve workspace context for the runner
      const step = await db.query.workflowSteps.findFirst({
        where: eq(workflowSteps.id, agentRun.stepId),
      });
      const run = step
        ? await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, step.runId) })
        : null;
      const workspace = run
        ? await db.query.workspaces.findFirst({ where: eq(workspaces.id, run.workspaceId) })
        : null;

      // Generate and persist feature branch name on first agent run for this run
      let featureBranch = run?.featureBranch ?? null;
      if (!featureBranch && run && workspace) {
        featureBranch = `aww/${workspace.slug}/${run.id.slice(0, 8)}`;
        await db
          .update(workflowRuns)
          .set({ featureBranch, updatedAt: new Date() })
          .where(eq(workflowRuns.id, run.id));
      }

      return {
        data: {
          ...updated,
          workspace_id: workspace?.id ?? null,
          workspace_slug: workspace?.slug ?? null,
          repo_url: workspace?.githubRepoUrl ?? null,
          default_branch: workspace?.defaultBranch ?? 'main',
          run_id: run?.id ?? null,
          feature_branch: featureBranch,
          input_artifact_ids: [],
          preferred_provider: workspace?.preferredProvider ?? 'anthropic',
        },
      };
    }
  );

  app.post<{ Params: AckTaskParams }>(
    '/:runnerId/tasks/:agentRunId/ack',
    {
      preHandler: requireRunner,
      schema: {
        params: {
          type: 'object',
          required: ['runnerId', 'agentRunId'],
          properties: {
            runnerId: { type: 'string', minLength: 1 },
            agentRunId: { type: 'string', minLength: 1 }
          }
        }
      }
    },
    async (request, reply) => {
      const { runnerId, agentRunId } = request.params;
      const authenticatedRunnerId = (request as RunnerRequest).runnerId;

      if (authenticatedRunnerId !== runnerId) {
        return reply.code(403).send({ error: 'forbidden_runner' });
      }

      const agentRun = await db.query.agentRuns.findFirst({
        where: eq(agentRuns.id, agentRunId),
      });

      if (!agentRun) {
        return reply.code(404).send({ error: 'not_found' });
      }

      if (agentRun.runnerId !== runnerId) {
        return reply.code(403).send({ error: 'forbidden_runner' });
      }

      return { data: agentRun };
    }
  );

  app.post<{ Params: { runnerId: string } }>(
    '/:runnerId/heartbeat',
    {
      preHandler: requireRunner,
      schema: {
        params: {
          type: 'object',
          required: ['runnerId'],
          properties: { runnerId: { type: 'string', minLength: 1 } }
        }
      }
    },
    async (request, reply) => {
      const { runnerId } = request.params;
      const authenticatedRunnerId = (request as RunnerRequest).runnerId;

      if (authenticatedRunnerId !== runnerId) {
        return reply.code(403).send({ error: 'forbidden_runner' });
      }

      const existing = await db.query.runners.findFirst({ where: eq(runners.id, runnerId) });
      if (!existing) {
        return reply.code(404).send({ error: 'not_found' });
      }

      const [updated] = await db
        .update(runners)
        .set({ lastHeartbeatAt: new Date(), status: 'online' })
        .where(eq(runners.id, runnerId))
        .returning();

      if (existing.status !== 'online') {
        await publishEvent(
          'runner.status_changed',
          { runner_id: updated.id, machine_id: updated.machineId, status: 'online', capabilities: updated.capabilities },
          updated.workspaceId,
        );
      }

      return reply.code(204).send();
    }
  );
};
