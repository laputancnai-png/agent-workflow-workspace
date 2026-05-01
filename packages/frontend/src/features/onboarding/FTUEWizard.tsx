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
  isSubmitting?: boolean;
  error?: string;
}

export function FTUEWizard({ onComplete, isSubmitting = false, error = '' }: FTUEWizardProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState(1);
  const [data, setData] = useState<WizardData>({ name: '', github_repo: '', prd: '' });

  const canNext = step === 1 ? data.name.trim().length > 0 : step === 2 ? true : data.prd.trim().length > 0;

  const handleNext = () => {
    if (!canNext || isSubmitting) return;
    if (step < 3) setStep((current) => current + 1);
    else onComplete(data);
  };

  return (
    <div className="flex h-full items-center justify-center bg-black/20 p-6 backdrop-blur-md">
      <div className="glass-panel w-full max-w-lg p-7">
        <div className="mb-5 flex items-center justify-between">
          <div className="text-lg font-extrabold text-[var(--ink)]">AWW</div>
        </div>
        <div className="mb-6 grid grid-cols-3 gap-1.5">
          {['项目', '仓库', 'PRD'].map((label, index) => (
            <div key={label}>
              <div className="mb-1 h-[3px] rounded-full" style={{ background: index + 1 <= step ? 'var(--amber)' : 'rgba(0,0,0,0.08)' }} />
              <span className="text-[11px] font-bold" style={{ color: index + 1 === step ? 'var(--amber)' : 'var(--subtle)' }}>{label}</span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="anim-fade">
          <h3 className="mb-4 text-lg font-extrabold text-[var(--ink)]">项目名称</h3>
          <input
            className="prototype-input"
            placeholder="Workspace name"
            value={data.name}
            onChange={(event) => setData((current) => ({ ...current, name: event.target.value }))}
          />
          </div>
        )}

        {step === 2 && (
          <div className="anim-fade">
          <h3 className="mb-4 text-lg font-extrabold text-[var(--ink)]">连接仓库</h3>
          <input
            className="prototype-input"
            placeholder="owner/repo  (e.g. acme/my-project, optional)"
            value={data.github_repo}
            onChange={(event) => setData((current) => ({ ...current, github_repo: event.target.value }))}
          />
          </div>
        )}

        {step === 3 && (
          <div className="anim-fade">
          <h3 className="mb-4 text-lg font-extrabold text-[var(--ink)]">添加 PRD</h3>
          <textarea
            className="prototype-input min-h-36 resize-none"
            value={data.prd}
            onChange={(event) => setData((current) => ({ ...current, prd: event.target.value }))}
          />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700" role="alert">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-between gap-2">
          <Button onClick={step === 1 ? undefined : () => setStep((current) => current - 1)} disabled={step === 1 || isSubmitting}>
            {step === 1 ? t('back') : `← ${t('back')}`}
          </Button>
          <Button
            variant="primary"
            disabled={!canNext || isSubmitting}
            onClick={handleNext}
            aria-label={step === 3 ? `${t('create')} Workspace` : t('next')}
          >
            {isSubmitting ? 'Creating...' : step === 3 ? `${t('create')} Workspace` : `${t('next')} →`}
          </Button>
        </div>
      </div>
    </div>
  );
}
