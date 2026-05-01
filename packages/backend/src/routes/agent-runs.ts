import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { agentRuns } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { INLINE_CONTENT_LIMIT, putArtifactContent } from '../lib/r2.js';
import { type RunnerRequest, requireRunner } from '../middleware/runner-auth.js';

import { publishEvent } from '../lib/sse.js';
import { requeueStep, scheduleNextStep } from '../services/scheduler.js';

interface InlineArtifact {
  role: string;
  content: string;
  git_commit_sha?: string;
}

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
    const body = request.body as {
      output_artifact_ids?: string[];
      output_artifacts?: InlineArtifact[];
      tokens_used?: number;
    };
    const runnerId = (request as RunnerRequest).runnerId;
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId)
    });

    if (!agentRun || agentRun.runnerId !== runnerId) {
      return reply.code(403).send({ error: 'forbidden_runner' });
    }

    if (agentRun.status !== 'running') {
      return { data: { ok: true } };
    }

    const createdArtifactIds: string[] = [];
    for (const art of body.output_artifacts ?? []) {
      const isLarge = Buffer.byteLength(art.content, 'utf8') > INLINE_CONTENT_LIMIT;
      const blobData = isLarge ? await putArtifactContent(art.content).catch(() => null) : null;

      const [artifact] = await db
        .insert(artifacts)
        .values({
          role: art.role as typeof artifacts.$inferInsert['role'],
          stepId: agentRun.stepId,
          contentInline: blobData ? null : art.content,
          blobKey: blobData?.blobKey ?? undefined,
          gitCommitSha: art.git_commit_sha,
          createdByType: 'agent',
          createdById: runnerId,
          status: 'committed',
          committedAt: new Date(),
        })
        .returning();
      createdArtifactIds.push(artifact.id);
    }

    const allArtifactIds = [...createdArtifactIds, ...(body.output_artifact_ids ?? [])];

    const [committed] = await db
      .update(agentRuns)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        outputPayloadRef: { artifact_ids: allArtifactIds }
      })
      .where(and(eq(agentRuns.id, agentRunId), eq(agentRuns.status, 'running')))
      .returning();

    if (!committed) {
      return { data: { ok: true } };
    }

    const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, agentRun.stepId) });
    if (step) {
      await db.update(workflowSteps)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(workflowSteps.id, step.id));

      await scheduleNextStep(step.runId, step.position);
    }

    return { data: { ok: true } };
  });

  app.post('/agent-runs/:agentRunId/fail', async (request, reply) => {
    const { agentRunId } = request.params as { agentRunId: string };
    const body = request.body as { retryable?: boolean };
    const runnerId = (request as RunnerRequest).runnerId;
    const agentRun = await db.query.agentRuns.findFirst({
      where: eq(agentRuns.id, agentRunId)
    });

    if (!agentRun || agentRun.runnerId !== runnerId) {
      return reply.code(403).send({ error: 'forbidden_runner' });
    }

    if (agentRun.status !== 'running') {
      return { data: { ok: true } };
    }

    await db
      .update(agentRuns)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(agentRuns.id, agentRunId));

    const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, agentRun.stepId) });
    if (!step) return { data: { ok: true } };

    const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, step.runId) });
    const workspaceId = run?.workspaceId;

    const retriesUsed = agentRun.attemptNumber;
    const canRetry = body.retryable !== false && retriesUsed <= step.maxRetries;

    if (canRetry) {
      await db.update(workflowSteps)
        .set({ status: 'retrying', updatedAt: new Date() })
        .where(eq(workflowSteps.id, step.id));
      await publishEvent('step.status_changed', { stepId: step.id, status: 'retrying', run_id: step.runId }, workspaceId);
      await requeueStep(step.id);
    } else {
      await db.update(workflowSteps)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(workflowSteps.id, step.id));
      await publishEvent('step.status_changed', { stepId: step.id, status: 'failed', run_id: step.runId }, workspaceId);
    }

    return { data: { ok: true } };
  });
};
