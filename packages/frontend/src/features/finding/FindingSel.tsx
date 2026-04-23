import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import { showToast } from '../../components/ui/Toast.js';
import { useUIStore } from '../../stores/ui.store.js';

interface FindingSelProps {
  onSubmit: (comment: string) => void;
}

export function FindingSel({ onSubmit }: FindingSelProps) {
  const { t } = useTranslation('approval');
  const isOpen = useUIStore((state) => state.isFindingSelOpen);
  const closeFindingSel = useUIStore((state) => state.closeFindingSel);
  const [comment, setComment] = useState('');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmed = comment.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setComment('');
    closeFindingSel();
    showToast(t('changes_requested'));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60">
      <section className="mx-auto w-full max-w-2xl rounded-t border border-[var(--line)] bg-[var(--surface)] p-6">
        <h3 className="m-0 mb-3 text-lg font-semibold text-[var(--ink)]">{t('finding_selector_title')}</h3>
        <textarea
          className="min-h-28 w-full resize-none rounded border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--blue)]"
          placeholder={t('finding_selector_placeholder')}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button onClick={closeFindingSel}>{t('common:cancel')}</Button>
          <Button variant="primary" disabled={!comment.trim()} onClick={handleSubmit}>
            {t('submit_changes')}
          </Button>
        </div>
      </section>
    </div>
  );
}
