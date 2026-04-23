import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface EmptyStateProps {
  onStart: () => void;
}

export function EmptyState({ onStart }: EmptyStateProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded border border-[var(--line)] text-lg font-bold text-[var(--blue)]">
        A
      </div>
      <h2 className="m-0 text-xl font-semibold text-[var(--ink)]">AWW</h2>
      <p className="m-0 max-w-sm text-sm leading-6 text-[var(--muted)]">{t('empty_state_hint')}</p>
      <Button variant="primary" onClick={onStart}>
        {t('create')} Workspace
      </Button>
    </div>
  );
}
