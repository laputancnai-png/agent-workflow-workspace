import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button.js';

interface AgentBannerProps {
  agentRole: string;
  startedAt: Date;
  onRerun?: () => void;
  onTakeOver?: () => void;
}

const WARN_THRESHOLD_SECONDS = 90;

export function AgentBanner({ agentRole, startedAt, onRerun, onTakeOver }: AgentBannerProps) {
  const { t } = useTranslation('workflow');
  const [elapsedSeconds, setElapsedSeconds] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const roleLabel = t(`agent_role.${agentRole}`, { defaultValue: agentRole });
  const remaining = Math.max(0, WARN_THRESHOLD_SECONDS - elapsedSeconds);
  const overdue = elapsedSeconds >= WARN_THRESHOLD_SECONDS;

  return (
    <div
      className={`flex min-h-10 items-center gap-2 rounded border px-3 py-1.5 ${
        overdue
          ? 'border-[var(--red)] bg-[var(--surface)]'
          : 'border-[var(--line)] bg-[var(--surface)]'
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${overdue ? 'bg-[var(--red)]' : 'bg-[var(--amber)]'}`}
      />
      <span className="text-sm font-medium text-[var(--ink)]">{roleLabel}</span>
      <span className="text-xs text-[var(--muted)]">{t('agent_running')}</span>

      {overdue ? (
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-[var(--red)]">{t('may_not_respond')}</span>
          {onRerun && (
            <Button onClick={onRerun}>
              {t('rerun')}
            </Button>
          )}
          {onTakeOver && (
            <Button onClick={onTakeOver}>
              {t('take_over')}
            </Button>
          )}
        </div>
      ) : (
        <span className="ml-auto text-xs text-[var(--muted)]">{remaining}s</span>
      )}
    </div>
  );
}
