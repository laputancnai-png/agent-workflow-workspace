import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { db } from '../db/index.js';
import { artifacts } from '../db/schema/artifacts.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { workspaceMembers, workspaces } from '../db/schema/workspaces.js';
import { BUILTIN_9STEP_TEMPLATE } from '../lib/templates.js';
import { publishEvent } from '../lib/sse.js';
import { type AuthenticatedRequest, requireUser } from '../middleware/user-auth.js';
import { scheduleNextStep } from '../services/scheduler.js';

const createRunSchema = z.object({
  template_id: z.literal(BUILTIN_9STEP_TEMPLATE.id),
});

function serializeStep(step: typeof workflowSteps.$inferSelect, artifactIds: string[]) {
  return {
    id: step.id,
    position: step.position,
    name: step.name,
    status: step.status,
    owner_type: step.ownerType,
    agent_role: step.agentRole ?? undefined,
    output_artifact_ids: artifactIds,
    updated_at: step.updatedAt.toISOString(),
  };
}

function serializeRun(run: typeof workflowRuns.$inferSelect) {
  return {
    id: run.id,
    workspace_id: run.workspaceId,
    status: run.status,
    feature_branch: run.featureBranch ?? undefined,
  };
}

async function findWorkspaceForUser(workspaceIdOrSlug: string, userId: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: or(eq(workspaces.id, workspaceIdOrSlug), eq(workspaces.slug, workspaceIdOrSlug)),
  });

  if (!workspace) return null;

  const member = await db.query.workspaceMembers.findFirst({
    where: and(eq(workspaceMembers.workspaceId, workspace.id), eq(workspaceMembers.userId, userId)),
  });

  return member ? { workspace, member } : null;
}

export const runRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/:workspaceId/runs', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const resolved = await findWorkspaceForUser(workspaceId, userId);

    if (!resolved) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const runs = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workspaceId, resolved.workspace.id))
      .orderBy(asc(workflowRuns.createdAt));

    return { data: runs.map(serializeRun) };
  });

  app.post('/:workspaceId/runs', async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const userId = (request as AuthenticatedRequest).userId;
    const parsed = createRunSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_run', issues: parsed.error.issues });
    }

    const resolved = await findWorkspaceForUser(workspaceId, userId);

    if (!resolved || !['owner', 'admin', 'contributor'].includes(resolved.member.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const [run] = await db
      .insert(workflowRuns)
      .values({
        workspaceId: resolved.workspace.id,
        triggeredById: userId,
        triggerType: 'manual',
        status: 'pending',
      })
      .returning();

    const steps = await db
      .insert(workflowSteps)
      .values(
        BUILTIN_9STEP_TEMPLATE.steps.map((step) => ({
          runId: run.id,
          position: step.seq,
          name: step.name,
          ownerType: step.ownerType,
          agentRole: step.agentRole,
          inputArtifactRoles: [...step.inputArtifactRoles],
          outputArtifactRoles: [...step.outputArtifactRoles],
          dependsOnStepIds: [],
          maxRetries: step.maxRetries,
          retryBackoffSeconds: step.retryBackoffSeconds,
        })),
      )
      .returning();

    const step1 = steps.find((s) => s.position === 1);
    if (step1) {
      await db
        .update(workflowSteps)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(workflowSteps.id, step1.id));
      await db
        .update(workflowRuns)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(workflowRuns.id, run.id));
      await publishEvent('step.status_changed', { stepId: step1.id, status: 'running', run_id: run.id }, resolved.workspace.id);
    }

    if (resolved.workspace.initialPrd?.trim()) {
      const now = new Date();
      const step2 = steps.find((s) => s.position === 2);

      if (step1 && step2) {
        await db.insert(artifacts).values({
          stepId: step2.id,
          role: 'PRD',
          status: 'committed',
          title: 'Initial PRD',
          contentInline: resolved.workspace.initialPrd,
          createdByType: 'human',
          createdById: userId,
          committedAt: now,
        });
        await db
          .update(workflowSteps)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(inArray(workflowSteps.id, [step1.id, step2.id]));
        await db
          .update(workflowRuns)
          .set({ status: 'running', updatedAt: now })
          .where(eq(workflowRuns.id, run.id));
        await publishEvent('step.status_changed', { stepId: step1.id, status: 'completed', run_id: run.id }, resolved.workspace.id);
        await publishEvent('step.status_changed', { stepId: step2.id, status: 'completed', run_id: run.id }, resolved.workspace.id);
        await scheduleNextStep(run.id, 2);
      }
    }

    const currentSteps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, run.id)).orderBy(asc(workflowSteps.position));
    const stepIds = currentSteps.map((s) => s.id);
    const stepArtifacts =
      stepIds.length > 0
        ? await db
            .select({ id: artifacts.id, stepId: artifacts.stepId })
            .from(artifacts)
            .where(and(inArray(artifacts.stepId, stepIds), eq(artifacts.status, 'committed')))
        : [];
    const artifactsByStep = new Map<string, string[]>();
    for (const art of stepArtifacts) {
      if (!art.stepId) continue;
      artifactsByStep.set(art.stepId, [...(artifactsByStep.get(art.stepId) ?? []), art.id]);
    }

    return reply.code(201).send({
      data: {
        ...serializeRun(run),
        status: step1 ? 'running' : 'pending',
        steps: currentSteps.map((s) => serializeStep(s, artifactsByStep.get(s.id) ?? [])),
      },
    });
  });
};

export const runDetailRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireUser);

  app.get('/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const userId = (request as AuthenticatedRequest).userId;

    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, runId),
    });

    if (!run) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const member = await db.query.workspaceMembers.findFirst({
      where: and(eq(workspaceMembers.workspaceId, run.workspaceId), eq(workspaceMembers.userId, userId)),
    });

    if (!member) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const steps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, runId)).orderBy(asc(workflowSteps.position));

    const stepIds = steps.map((s) => s.id);
    const stepArtifacts =
      stepIds.length > 0
        ? await db
            .select({ id: artifacts.id, stepId: artifacts.stepId })
            .from(artifacts)
            .where(and(inArray(artifacts.stepId, stepIds), eq(artifacts.status, 'committed')))
        : [];

    const artifactsByStep = new Map<string, string[]>();
    for (const art of stepArtifacts) {
      if (!art.stepId) continue;
      const existing = artifactsByStep.get(art.stepId) ?? [];
      existing.push(art.id);
      artifactsByStep.set(art.stepId, existing);
    }

    return {
      data: {
        ...serializeRun(run),
        steps: steps.map((s) => serializeStep(s, artifactsByStep.get(s.id) ?? [])),
      },
    };
  });
};
