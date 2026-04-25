import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge.js';

const statusColor: Record<string, 'green' | 'amber' | 'red' | 'teal' | 'violet' | 'muted'> = {
  completed: 'green',
  running: 'amber',
  failed: 'red',
  timed_out: 'red',
  retrying: 'amber',
  human_owned: 'violet',
  pending: 'muted',
  cancelled: 'muted'
};

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation('workflow');
  return <Badge color={statusColor[status] ?? 'muted'}>{t(`status.${status}`, { defaultValue: status })}</Badge>;
}
