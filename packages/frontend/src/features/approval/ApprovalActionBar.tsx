import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import type { DecisionAction } from '../../hooks/useDecision.js';
import { useUIStore } from '../../stores/ui.store.js';

interface ApprovalActionBarProps {
  stepId: string;
  outputArtifactId?: string | null;
  onDecision: (opts: { action: DecisionAction; comment?: string }) => void;
}

export function ApprovalActionBar({ stepId, outputArtifactId, onDecision }: ApprovalActionBarProps) {
  const { t } = useTranslation('approval');
  const openFindingSel = useUIStore((state) => state.openFindingSel);
  const openTakeOverModal = useUIStore((state) => state.openTakeOverModal);
  const openEditOutput = useUIStore((state) => state.openEditOutput);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="primary" onClick={() => onDecision({ action: 'approve' })}>
        {t('approve')}
      </Button>
      <Button onClick={openFindingSel}>{t('request_changes')}</Button>

      <div className="hidden flex-col gap-2 sm:flex">
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => openEditOutput(stepId, outputArtifactId ?? null)}>{t('edit_output')}</Button>
          <Button onClick={openTakeOverModal}>{t('take_over')}</Button>
        </div>
        <Button variant="danger" onClick={() => onDecision({ action: 'reject' })}>
          {t('reject')}
        </Button>
      </div>
    </div>
  );
}
