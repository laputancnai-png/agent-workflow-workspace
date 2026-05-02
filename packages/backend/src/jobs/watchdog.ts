import { and, eq, isNull, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { agentRuns, runners } from '../db/schema/runners.js';
import { workflowRuns, workflowSteps } from '../db/schema/workflows.js';
import { publishEvent } from '../lib/sse.js';
import { scheduleNextStep, requeueStep } from '../services/scheduler.js';
import { agentRunTimedOut } from '../services/state-machine.js';

const AGENT_RUN_TIMEOUT_SECONDS = 120;
const RUNNER_HEARTBEAT_TIMEOUT_SECONDS = 60;
const SCAN_INTERVAL_MS = 30_000;

export async function scanTimedOutRunners(now = new Date()) {
  const cutoff = new Date(now.getTime() - RUNNER_HEARTBEAT_TIMEOUT_SECONDS * 1000);
  const stale = await db
    .select()
    .from(runners)
    .where(and(eq(runners.status, 'online'), lt(runners.lastHeartbeatAt, cutoff)));

  for (const runner of stale) {
    await db.update(runners).set({ status: 'offline' }).where(eq(runners.id, runner.id));
    await publishEvent(
      'runner.status_changed',
      { runner_id: runner.id, machine_id: runner.machineId, status: 'offline', capabilities: runner.capabilities },
      runner.workspaceId,
    );
  }

  return stale.length;
}

export async function scanTimedOutAgentRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - AGENT_RUN_TIMEOUT_SECONDS * 1000);
  const timedOut = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.status, 'running'), lt(agentRuns.lastHeartbeatAt, cutoff)));

  for (const agentRun of timedOut) {
    const { newStepStatus } = agentRunTimedOut();
    const step = await db.query.workflowSteps.findFirst({
      where: eq(workflowSteps.id, agentRun.stepId)
    });
    const run = step
      ? await db.query.workflowRuns.findFirst({
          where: eq(workflowRuns.id, step.runId)
        })
      : null;

    await db
      .update(agentRuns)
      .set({ status: 'timed_out', updatedAt: new Date() })
      .where(eq(agentRuns.id, agentRun.id));

    await db
      .update(workflowSteps)
      .set({ status: newStepStatus, updatedAt: new Date() })
      .where(eq(workflowSteps.id, agentRun.stepId));

    await publishEvent('agent_run.failed', {
      agentRunId: agentRun.id,
      stepId: agentRun.stepId,
      reason: 'timeout',
      run_id: step?.runId,
    }, run?.workspaceId);

    await requeueStep(agentRun.stepId);
  }

  return timedOut.length;
}

/**
 * Reschedule agent steps that are stuck in `pending` state because no runner
 * was available when the scheduler first tried. Runs whenever a runner is online.
 */
export async function scanOrphanedPendingSteps() {
  // Find active runs that have at least one online runner in their workspace
  const activeRuns = await db
    .select({ id: workflowRuns.id, workspaceId: workflowRuns.workspaceId })
    .from(workflowRuns)
    .where(eq(workflowRuns.status, 'running'));

  for (const run of activeRuns) {
    const onlineRunner = await db.query.runners.findFirst({
      where: and(eq(runners.workspaceId, run.workspaceId), eq(runners.status, 'online')),
    });
    if (!onlineRunner) continue;

    // Find the earliest pending agent step with no agent_run assigned
    const pendingAgentStep = await db.query.workflowSteps.findFirst({
      where: and(
        eq(workflowSteps.runId, run.id),
        eq(workflowSteps.status, 'pending'),
        eq(workflowSteps.ownerType, 'agent'),
      ),
      orderBy: (ws, { asc }) => [asc(ws.position)],
    });

    if (!pendingAgentStep) continue;

    // Only reschedule if no active agent_run exists for this step
    const existingRun = await db.query.agentRuns.findFirst({
      where: and(eq(agentRuns.stepId, pendingAgentStep.id), eq(agentRuns.status, 'pending')),
    });
    if (existingRun) continue;

    // Trigger rescheduling via the scheduler (reuses the same logic)
    await scheduleNextStep(run.id, pendingAgentStep.position - 1).catch((err: unknown) => {
      process.stderr.write(`[watchdog] reschedule failed for step ${pendingAgentStep.id}: ${String(err)}\n`);
    });
  }
}

export function startWatchdog() {
  return setInterval(() => {
    Promise.all([
      scanTimedOutAgentRuns(),
      scanTimedOutRunners(),
      scanOrphanedPendingSteps(),
    ]).catch((error: unknown) => {
      console.error('[watchdog] error:', error);
    });
  }, SCAN_INTERVAL_MS);
}
