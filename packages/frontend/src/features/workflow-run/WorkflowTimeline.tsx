import { StatusPill } from '../../components/common/StatusPill.js';
import type { WorkflowStep } from '../../hooks/useRun.js';

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

const statusIcon: Record<string, string> = {
  completed: 'Done',
  running: 'Run',
  pending: 'Wait',
  failed: 'Fail',
  timed_out: 'Time',
  retrying: 'Retry',
  human_owned: 'Human',
  cancelled: 'Stop'
};

const ownerLabel: Record<string, string> = {
  human: 'Human',
  agent: 'Agent',
  approval_gate: 'Gate'
};

export function WorkflowTimeline({ steps, selectedStepId, onSelectStep }: WorkflowTimelineProps) {
  return (
    <div className="flex flex-col gap-1 overflow-y-auto px-2 py-3">
      {steps.map((step) => (
        <button
          key={step.id}
          type="button"
          onClick={() => onSelectStep(step.id)}
          className={`workflow-step ${
            selectedStepId === step.id ? 'is-selected' : ''
          }`}
        >
          <span className="step-position">{String(step.position).padStart(2, '0')}</span>
          <span className={`step-dot is-${step.status.replace(/_/g, '-')}`} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-[var(--ink)]">{step.name}</span>
            <span className="mt-0.5 block text-[11px] font-semibold text-[var(--subtle)]">
              {ownerLabel[step.owner_type] ?? step.owner_type} · {statusIcon[step.status] ?? 'Wait'}
            </span>
          </span>
          <StatusPill status={step.status} />
        </button>
      ))}
    </div>
  );
}
