import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface AgentBannerProps {
  agentRole: string;
  startedAt: Date;
}

const warnThresholdSeconds = 90;

export function AgentBanner({ agentRole, startedAt }: AgentBannerProps) {
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
  const remaining = Math.max(0, warnThresholdSeconds - elapsedSeconds);
  const overdue = elapsedSeconds >= warnThresholdSeconds;

  return (
    <div className="flex min-h-10 items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-[var(--amber)]" />
      <span className="text-sm font-medium text-[var(--ink)]">{roleLabel}</span>
      <span className="text-xs text-[var(--muted)]">{t('agent_running')}</span>
      <span className="ml-auto text-xs text-[var(--muted)]">{overdue ? t('may_not_respond') : `${remaining}s`}</span>
    </div>
  );
}
