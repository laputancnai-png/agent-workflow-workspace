import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface EmptyStateProps {
  onStart: () => void;
}

export function EmptyState({ onStart }: EmptyStateProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex h-full flex-col items-center justify-center px-12 text-center">
      <div className="mb-7 animate-[float_3s_ease-in-out_infinite]">
        <svg width="110" height="70" viewBox="0 0 110 70" fill="none" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <circle
              key={item}
              cx={8 + item * 13}
              cy={35 + Math.sin(item * 0.9) * 13}
              r={item === 3 ? 6 : 3.5}
              fill={item === 3 ? 'var(--amber)' : 'var(--agent-soft)'}
              stroke={item === 3 ? 'var(--amber)' : 'var(--teal)'}
              strokeWidth={item === 3 ? 0 : 1.5}
              opacity={0.25 + item * 0.1}
            />
          ))}
        </svg>
      </div>
      <h1 className="mb-2.5 text-[26px] font-extrabold tracking-normal text-[var(--ink)]">以信心交付功能</h1>
      <p className="mb-7 max-w-sm text-[14.5px] leading-7 text-[var(--muted)]">{t('empty_state_hint')}</p>
      <Button variant="primary" onClick={onStart}>
        + {t('create')} Workspace
      </Button>
    </div>
  );
}
