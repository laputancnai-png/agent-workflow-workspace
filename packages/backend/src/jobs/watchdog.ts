import { and, eq, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { agentRuns } from '../db/schema/runners.js';
import { workflowSteps } from '../db/schema/workflows.js';
import { publishEvent } from '../lib/sse.js';
import { agentRunTimedOut } from '../services/state-machine.js';

const TIMEOUT_SECONDS = 120;
const SCAN_INTERVAL_MS = 30_000;

export async function scanTimedOutAgentRuns(now = new Date()) {
  const cutoff = new Date(now.getTime() - TIMEOUT_SECONDS * 1000);
  const timedOut = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.status, 'running'), lt(agentRuns.lastHeartbeatAt, cutoff)));

  for (const agentRun of timedOut) {
    const { newStepStatus } = agentRunTimedOut();

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
    });
  }

  return timedOut.length;
}

export function startWatchdog() {
  return setInterval(() => {
    scanTimedOutAgentRuns().catch((error: unknown) => {
      console.error('[watchdog] error:', error);
    });
  }, SCAN_INTERVAL_MS);
}
