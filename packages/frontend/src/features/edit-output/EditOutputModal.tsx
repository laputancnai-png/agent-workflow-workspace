import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';
import { useArtifact } from '../../hooks/useArtifact.js';
import { useCreateArtifact } from '../../hooks/useCreateArtifact.js';
import { useSubmitDecision } from '../../hooks/useDecision.js';
import { showToast } from '../../components/ui/Toast.js';
import { useUIStore } from '../../stores/ui.store.js';

export function EditOutputModal() {
  const { t } = useTranslation(['approval', 'common']);
  const isOpen = useUIStore((state) => state.isEditOutputOpen);
  const stepId = useUIStore((state) => state.editOutputStepId);
  const artifactId = useUIStore((state) => state.editOutputArtifactId);
  const closeEditOutput = useUIStore((state) => state.closeEditOutput);

  const { data: artifact, isLoading } = useArtifact(artifactId ?? '');
  const { mutateAsync: createArtifact, isPending: isCreating } = useCreateArtifact();
  const { mutateAsync: submitDecision, isPending: isSubmitting } = useSubmitDecision();

  const [editedContent, setEditedContent] = useState('');

  useEffect(() => {
    if (artifact?.content_inline) {
      setEditedContent(artifact.content_inline);
    } else {
      setEditedContent('');
    }
  }, [artifact?.content_inline]);

  if (!isOpen) return null;

  const originalContent = artifact?.content_inline ?? '';
  const isBusy = isCreating || isSubmitting;

  const handleSubmit = async () => {
    if (!stepId) return;
    try {
      const created = await createArtifact({
        role: 'HUMAN_EDIT',
        step_id: stepId,
        parent_artifact_id: artifactId ?? undefined,
        content_inline: editedContent,
      });
      await submitDecision({
        stepId,
        action: 'edit',
        edited_artifact_id: created.id,
      });
      showToast(t('approval:decision_submitted'));
      closeEditOutput();
    } catch {
      showToast(t('common:error'), 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <section className="flex h-[80vh] w-full max-w-5xl flex-col rounded border border-[var(--line)] bg-[var(--surface)]">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h3 className="m-0 text-base font-semibold text-[var(--ink)]">{t('approval:edit_output')}</h3>
          <button
            type="button"
            className="text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={closeEditOutput}
            aria-label={t('common:close')}
          >
            ✕
          </button>
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">
            {t('common:loading')}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 overflow-hidden divide-x divide-[var(--line)]">
            <div className="flex flex-col overflow-hidden">
              <p className="border-b border-[var(--line)] px-4 py-2 text-xs font-medium text-[var(--muted)] uppercase">
                Original
              </p>
              <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs text-[var(--ink)] leading-relaxed">
                {originalContent || <span className="text-[var(--muted)]">(empty)</span>}
              </pre>
            </div>

            <div className="flex flex-col overflow-hidden">
              <p className="border-b border-[var(--line)] px-4 py-2 text-xs font-medium text-[var(--muted)] uppercase">
                Edited
              </p>
              <textarea
                className="flex-1 resize-none p-4 font-mono text-xs text-[var(--ink)] leading-relaxed bg-[var(--surface)] outline-none focus:bg-[var(--surface-soft)]"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
        )}

        <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
          <Button onClick={closeEditOutput} disabled={isBusy}>
            {t('common:cancel')}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isBusy || isLoading}>
            {isBusy ? t('common:loading') : t('approval:submit_edit')}
          </Button>
        </footer>
      </section>
    </div>
  );
}
