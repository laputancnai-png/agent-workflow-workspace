import { eq } from 'drizzle-orm';

import { db } from '../db/index.js';
import { agentRuns } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { publishEvent } from '../lib/sse.js';
import { executeCliAgentRun } from './cli-agent-executor.js';

async function scheduleAgentStep(
  step: typeof workflowSteps.$inferSelect,
  run: typeof workflowRuns.$inferSelect,
): Promise<void> {
  const [agentRun] = await db
    .insert(agentRuns)
    .values({
      stepId: step.id,
      status: 'running',
      agentRole: step.agentRole!,
    })
    .returning();

  await db.update(workflowSteps)
    .set({ status: 'running', updatedAt: new Date() })
    .where(eq(workflowSteps.id, step.id));

  await publishEvent('step.status_changed', { stepId: step.id, status: 'running', run_id: run.id }, run.workspaceId);

  setImmediate(() => {
    executeCliAgentRun(agentRun.id).catch(() => {
      void failRun(run.id, run.workspaceId);
    });
  });
}

export async function scheduleNextStep(runId: string, completedStepPosition: number): Promise<void> {
  const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) });
  if (!run) return;

  const allSteps = await db.select().from(workflowSteps).where(eq(workflowSteps.runId, runId));
  const nextStep = allSteps
    .filter((s) => s.position === completedStepPosition + 1 && s.status === 'pending')
    [0];

  if (!nextStep) {
    await db.update(workflowRuns)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
    return;
  }

  if (nextStep.ownerType === 'agent' && nextStep.agentRole) {
    await scheduleAgentStep(nextStep, run);
  } else {
    await db.update(workflowSteps)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(workflowSteps.id, nextStep.id));
    await publishEvent('step.status_changed', { stepId: nextStep.id, status: 'running', run_id: runId }, run.workspaceId);
  }
}

export async function requeueStep(stepId: string): Promise<void> {
  const step = await db.query.workflowSteps.findFirst({ where: eq(workflowSteps.id, stepId) });
  if (!step || !step.agentRole) return;

  const run = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, step.runId) });
  if (!run) return;

  await scheduleAgentStep(step, run);
}

export async function failRun(runId: string, workspaceId: string): Promise<void> {
  await db.update(workflowRuns)
    .set({ status: 'failed', updatedAt: new Date() })
    .where(eq(workflowRuns.id, runId));
  await publishEvent('step.status_changed', { run_id: runId, status: 'failed' }, workspaceId);
}
