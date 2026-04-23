import { StatusPill } from '../../components/common/StatusPill.js';
import type { WorkflowStep } from '../../hooks/useRun.js';

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}

const statusIcon: Record<string, string> = {
  completed: 'done',
  running: 'run',
  pending: 'wait',
  failed: 'fail',
  timed_out: 'time',
  retrying: 'retry',
  human_owned: 'user',
  cancelled: 'stop'
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
          className={`grid w-full grid-cols-[42px_1fr_auto] items-center gap-2 rounded px-3 py-2 text-left transition-colors ${
            selectedStepId === step.id ? 'bg-[var(--surface-soft)]' : 'hover:bg-[var(--surface)]'
          }`}
        >
          <span className="text-xs font-medium text-[var(--muted)]">{statusIcon[step.status] ?? 'wait'}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-[var(--ink)]">{step.name}</span>
            <span className="block text-xs text-[var(--muted)]">{ownerLabel[step.owner_type] ?? step.owner_type}</span>
          </span>
          <StatusPill status={step.status} />
        </button>
      ))}
    </div>
  );
}
