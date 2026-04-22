import type { InferSelectModel } from 'drizzle-orm';

import type { workflowSteps } from '../db/schema/workflows.js';

export type StepStatus = InferSelectModel<typeof workflowSteps>['status'];
export type DecisionAction = 'approve' | 'reject' | 'request_changes' | 'edit' | 'take_over' | 'rerun';
export type RunEffect = 'advance' | 'fail_run' | 'requeue_step' | 'none';

export function applyDecision(
  currentStatus: StepStatus,
  action: DecisionAction,
): { newStepStatus: StepStatus; runEffect: RunEffect } {
  switch (action) {
    case 'approve':
      return { newStepStatus: 'completed', runEffect: 'advance' };
    case 'reject':
      return { newStepStatus: 'cancelled', runEffect: 'fail_run' };
    case 'request_changes':
    case 'rerun':
      return { newStepStatus: 'retrying', runEffect: 'requeue_step' };
    case 'edit':
      return { newStepStatus: currentStatus, runEffect: 'none' };
    case 'take_over':
      return { newStepStatus: 'human_owned', runEffect: 'none' };
  }
}

export function agentRunTimedOut(): { newStepStatus: StepStatus; runEffect: RunEffect } {
  return { newStepStatus: 'timed_out', runEffect: 'requeue_step' };
}
