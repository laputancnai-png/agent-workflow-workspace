import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import { useUIStore } from '../../stores/ui.store.js';

interface TakeOverModalProps {
  stepId: string;
  featureBranch: string;
}

export function TakeOverModal({ stepId: _stepId, featureBranch }: TakeOverModalProps) {
  const { t } = useTranslation('approval');
  const isOpen = useUIStore((state) => state.isTakeOverModalOpen);
  const close = useUIStore((state) => state.closeTakeOverModal);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <section className="w-full max-w-lg rounded border border-[var(--line)] bg-[var(--surface)] p-6">
        <h3 className="m-0 mb-4 text-lg font-semibold text-[var(--ink)]">{t('take_over_instructions')}</h3>
        <div className="mb-4">
          <div className="mb-1 text-xs text-[var(--muted)]">{t('take_over_branch')}</div>
          <code className="block rounded bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--teal)]">
            {featureBranch || 'feature/current-run'}
          </code>
        </div>
        <p className="m-0 mb-4 text-sm leading-6 text-[var(--muted)]">{t('take_over_hint')}</p>
        <div className="flex justify-end">
          <Button onClick={close}>{t('common:close')}</Button>
        </div>
      </section>
    </div>
  );
}
