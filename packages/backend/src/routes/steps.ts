import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { decisions } from '../db/schema/decisions.js';
import { agentRuns } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaceMembers } from '../db/schema/workspaces.js';
import { publishEvent } from '../lib/sse.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';
import { requeueStep } from '../services/scheduler.js';

const rerunSchema = z.object({
  reason: z.string().min(1),
  reset_from_artifact_id: z.string().optional()
});

async function loadAuthorizedStep(stepId: string, userId: string) {
  const step = await db.query.workflowSteps.findFirst({
    where: eq(workflowSteps.id, stepId)
  });

  if (!step) return null;

  const run = await db.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, step.runId)
  });

  if (!run) return null;

  const member = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, run.workspaceId), eq(workspaceMembers.userId, userId))
  });

  if (!member) return null;

  return { step, run };
}

export const stepRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/steps/:stepId', async (request, reply) => {
    const { stepId } = request.params as { stepId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const loaded = await loadAuthorizedStep(stepId, userId);

    if (!loaded) {
      return reply.code(404).send({ error: 'step_not_found' });
    }

    const stepArtifacts = await db.select().from(artifacts).where(eq(artifacts.stepId, loaded.step.id));

    return {
      data: {
        ...loaded.step,
        run_id: loaded.run.id,
        workspace_id: loaded.run.workspaceId,
        artifacts: stepArtifacts
      }
    };
  });

  app.post('/steps/:stepId/start', async (request, reply) => {
    const { stepId } = request.params as { stepId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const loaded = await loadAuthorizedStep(stepId, userId);

    if (!loaded) {
      return reply.code(404).send({ error: 'step_not_found' });
    }

    await db
      .update(workflowSteps)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(workflowSteps.id, stepId));

    await publishEvent('step.status_changed', { stepId, status: 'running', run_id: loaded.run.id }, loaded.run.workspaceId);

    return { data: { step_id: stepId, step_status: 'running' } };
  });

  app.post('/steps/:stepId/rerun', async (request, reply) => {
    const { stepId } = request.params as { stepId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = rerunSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_rerun', issues: parsed.error.issues });
    }

    const loaded = await loadAuthorizedStep(stepId, userId);
    if (!loaded) {
      return reply.code(404).send({ error: 'step_not_found' });
    }

    if (!['failed', 'timed_out', 'cancelled', 'retrying'].includes(loaded.step.status)) {
      return reply.code(409).send({ error: 'step_not_retryable', status: loaded.step.status });
    }

    await db
      .update(agentRuns)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(agentRuns.stepId, stepId), eq(agentRuns.status, 'running')));

    await db
      .update(workflowSteps)
      .set({ status: 'retrying', completedAt: null, updatedAt: new Date() })
      .where(eq(workflowSteps.id, stepId));

    await db
      .update(workflowRuns)
      .set({ status: 'running', completedAt: null, updatedAt: new Date() })
      .where(eq(workflowRuns.id, loaded.run.id));

    await db.insert(decisions).values({
      stepId,
      actorId: userId,
      action: 'rerun',
      comment: parsed.data.reason,
      artifactVersionId: parsed.data.reset_from_artifact_id
    });

    await publishEvent('step.status_changed', { stepId, status: 'retrying', run_id: loaded.run.id }, loaded.run.workspaceId);
    await requeueStep(stepId);

    return { data: { step_id: stepId, step_status: 'running' } };
  });

  app.post('/steps/:stepId/take-over', async (request, reply) => {
    const { stepId } = request.params as { stepId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const loaded = await loadAuthorizedStep(stepId, userId);

    if (!loaded) {
      return reply.code(404).send({ error: 'step_not_found' });
    }

    await db
      .update(workflowSteps)
      .set({ status: 'human_owned', updatedAt: new Date() })
      .where(eq(workflowSteps.id, stepId));

    await db.insert(decisions).values({
      stepId,
      actorId: userId,
      action: 'take_over'
    });

    await publishEvent('step.status_changed', { stepId, status: 'human_owned', run_id: loaded.run.id }, loaded.run.workspaceId);

    return {
      data: {
        step_id: stepId,
        step_status: 'human_owned',
        feature_branch: loaded.run.featureBranch,
        base_commit_sha: loaded.run.baseCommitSha
      }
    };
  });
};
