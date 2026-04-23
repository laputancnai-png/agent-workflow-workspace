import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import type { DecisionAction } from '../../hooks/useDecision.js';
import { useUIStore } from '../../stores/ui.store.js';

interface ApprovalActionBarProps {
  stepId: string;
  onDecision: (opts: { action: DecisionAction; comment?: string }) => void;
}

export function ApprovalActionBar({ stepId: _stepId, onDecision }: ApprovalActionBarProps) {
  const { t } = useTranslation('approval');
  const openFindingSel = useUIStore((state) => state.openFindingSel);
  const openTakeOverModal = useUIStore((state) => state.openTakeOverModal);

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button className="col-span-2" variant="primary" onClick={() => onDecision({ action: 'approve' })}>
        {t('approve')}
      </Button>
      <Button onClick={openFindingSel}>{t('request_changes')}</Button>
      <Button onClick={() => onDecision({ action: 'edit' })}>{t('edit_output')}</Button>
      <Button onClick={openTakeOverModal}>{t('take_over')}</Button>
      <Button variant="danger" onClick={() => onDecision({ action: 'reject' })}>
        {t('reject')}
      </Button>
    </div>
  );
}
