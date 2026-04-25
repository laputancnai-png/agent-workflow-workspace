import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { decisions } from '../db/schema/decisions.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { publishEvent } from '../lib/sse.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';
import { failRun, requeueStep, scheduleNextStep } from '../services/scheduler.js';
import { applyDecision } from '../services/state-machine.js';

const decisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'edit', 'take_over', 'rerun']),
  comment: z.string().optional(),
  edited_artifact_id: z.string().optional(),
  target_step_id: z.string().optional(),
});

export const decisionRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.post('/steps/:stepId/decision', async (request, reply) => {
    const { stepId } = request.params as { stepId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = decisionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_decision', issues: parsed.error.issues });
    }

    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, stepId),
    });

    if (!step) {
      return reply.code(404).send({ error: 'step_not_found' });
    }

    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, step.runId),
    });

    const { newStepStatus, runEffect } = applyDecision(step.status, parsed.data.action);

    await db
      .update(workflowSteps)
      .set({ status: newStepStatus, updatedAt: new Date() })
      .where(eq(workflowSteps.id, stepId));

    const [decision] = await db
      .insert(decisions)
      .values({
        stepId,
        actorId: userId,
        action: parsed.data.action,
        comment: parsed.data.comment,
        artifactVersionId: parsed.data.edited_artifact_id,
        targetStepId: parsed.data.target_step_id,
      })
      .returning();

    await publishEvent('step.status_changed', { stepId, status: newStepStatus, runEffect, run_id: step.runId }, run?.workspaceId);

    if (runEffect === 'advance' && run) {
      await scheduleNextStep(step.runId, step.position);
    } else if (runEffect === 'requeue_step') {
      await requeueStep(stepId);
    } else if (runEffect === 'fail_run' && run) {
      await failRun(step.runId, run.workspaceId);
    }

    return reply.code(201).send({ data: decision });
  });
};
