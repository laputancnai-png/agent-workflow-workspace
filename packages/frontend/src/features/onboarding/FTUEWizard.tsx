import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface WizardData {
  name: string;
  github_repo: string;
  prd: string;
}

interface FTUEWizardProps {
  onComplete: (data: WizardData) => void | Promise<void>;
}

export function FTUEWizard({ onComplete }: FTUEWizardProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({ name: '', github_repo: '', prd: '' });

  const canNext = step === 1 ? data.name.trim().length > 0 : step === 2 ? true : data.prd.trim().length > 0;

  const handleNext = () => {
    if (!canNext) return;
    if (step < 3) setStep((current) => current + 1);
    else onComplete(data);
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 p-6">
      <div className="mb-2 grid grid-cols-3 gap-2">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="h-1 rounded"
            style={{ background: item <= step ? 'var(--blue)' : 'var(--line)' }}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <h3 className="m-0 text-lg font-semibold text-[var(--ink)]">Workspace Name</h3>
          <input
            className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--blue)]"
            placeholder="Workspace name"
            value={data.name}
            onChange={(event) => setData((current) => ({ ...current, name: event.target.value }))}
          />
        </>
      )}

      {step === 2 && (
        <>
          <h3 className="m-0 text-lg font-semibold text-[var(--ink)]">GitHub Repository</h3>
          <input
            className="rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--blue)]"
            placeholder="owner/repo  (e.g. acme/my-project, optional)"
            value={data.github_repo}
            onChange={(event) => setData((current) => ({ ...current, github_repo: event.target.value }))}
          />
        </>
      )}

      {step === 3 && (
        <>
          <h3 className="m-0 text-lg font-semibold text-[var(--ink)]">Paste your PRD</h3>
          <textarea
            className="min-h-40 resize-y rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--blue)]"
            value={data.prd}
            onChange={(event) => setData((current) => ({ ...current, prd: event.target.value }))}
          />
        </>
      )}

      <div className="flex justify-end gap-2">
        {step > 1 && <Button onClick={() => setStep((current) => current - 1)}>{t('back')}</Button>}
        <Button variant="primary" disabled={!canNext} onClick={handleNext}>
          {step === 3 ? `${t('create')} Workspace` : t('next')}
        </Button>
      </div>
    </div>
  );
}
