import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { showToast } from '../components/ui/Toast.js';
import { ApprovalActionBar } from '../features/approval/ApprovalActionBar.js';
import { EditOutputModal } from '../features/edit-output/EditOutputModal.js';
import { FindingSel } from '../features/finding/FindingSel.js';
import { TakeOverModal } from '../features/take-over/TakeOverModal.js';
import { AgentBanner } from '../features/workflow-run/AgentBanner.js';
import { WorkflowTimeline } from '../features/workflow-run/WorkflowTimeline.js';
import { useSubmitDecision, type DecisionAction } from '../hooks/useDecision.js';
import { useStepChangeNotifications } from '../hooks/useNotifications.js';
import { useRun } from '../hooks/useRun.js';
import { useUIStore } from '../stores/ui.store.js';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { t } = useTranslation(['common', 'workflow', 'approval']);
  const { data: run, isLoading } = useRun(runId ?? '');
  const selectedStepId = useUIStore((state) => state.selectedStepId);
  const selectStep = useUIStore((state) => state.selectStep);
  const { mutateAsync: submitDecision } = useSubmitDecision();

  const openTakeOverModal = useUIStore((state) => state.openTakeOverModal);

  useStepChangeNotifications(run?.steps);

  const activeStep =
    run?.steps.find((step) => step.id === selectedStepId) ??
    run?.steps.find((step) => step.status === 'running') ??
    run?.steps[0];

  const handleDecision = async ({ action, comment }: { action: DecisionAction; comment?: string }) => {
    if (!activeStep) return;

    try {
      await submitDecision({ stepId: activeStep.id, action, comment });
      showToast(t('approval:decision_submitted'));
    } catch {
      showToast(t('common:error'), 'error');
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-[var(--muted)]">{t('common:loading')}</div>;
  if (!run) return <div className="p-6 text-sm text-[var(--red)]">{t('common:error')}</div>;

  return (
    <div className="grid h-full grid-cols-[288px_1fr_340px] overflow-hidden">
      <aside className="flex min-w-0 flex-col overflow-hidden border-r border-[var(--line)]">
        <div className="border-b border-[var(--line)] px-4 py-3 text-xs text-[var(--muted)]">
          {t('workflow:workflow')} · {run.steps.length} steps
        </div>
        <WorkflowTimeline steps={run.steps} selectedStepId={selectedStepId} onSelectStep={selectStep} />
      </aside>

      <section className="min-w-0 overflow-auto p-6">
        {activeStep?.agent_role && activeStep.status === 'running' ? (
          <AgentBanner
            agentRole={activeStep.agent_role}
            startedAt={new Date(activeStep.updated_at)}
            onRerun={() => handleDecision({ action: 'rerun' })}
            onTakeOver={openTakeOverModal}
          />
        ) : null}
        <div className="mt-5">
          <h1 className="m-0 text-2xl font-semibold text-[var(--ink)]">{activeStep?.name ?? t('workflow:step')}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{activeStep?.status ?? run.status}</p>
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-3 border-l border-[var(--line)] p-4">
        <h2 className="m-0 text-sm font-semibold text-[var(--ink)]">{t('approval:approve_plan')}</h2>
        {activeStep?.owner_type === 'approval_gate' ? (
          <ApprovalActionBar
            stepId={activeStep.id}
            outputArtifactId={activeStep.output_artifact_ids.at(-1) ?? null}
            onDecision={handleDecision}
          />
        ) : (
          <p className="m-0 text-sm text-[var(--muted)]">{t('workflow:step')}</p>
        )}
      </aside>

      <FindingSel onSubmit={(comment) => handleDecision({ action: 'request_changes', comment })} />
      <TakeOverModal stepId={activeStep?.id ?? ''} featureBranch={run.feature_branch ?? ''} />
      <EditOutputModal />
    </div>
  );
}
