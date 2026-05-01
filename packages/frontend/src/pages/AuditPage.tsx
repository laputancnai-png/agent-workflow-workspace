import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/ui/Badge.js';
import { getApiClient } from '../lib/api-client.js';

interface AuditEvent {
  stream_id: string;
  event_type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

const eventColor: Record<string, 'green' | 'amber' | 'teal' | 'violet' | 'red'> = {
  'step.status_changed': 'teal',
  'step.completed': 'green',
  'artifact.created': 'amber',
  'agent_run.started': 'teal',
  'decision.approved': 'violet',
  'run.failed': 'red',
};

function eventDescription(event: AuditEvent): string {
  const p = event.payload;
  switch (event.event_type) {
    case 'step.status_changed':
      return `步骤状态变更 → ${p.status ?? ''}${p.no_runner ? '（无可用 Runner）' : ''}`;
    default:
      return JSON.stringify(p);
  }
}

export function AuditPage() {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();

  const { data: events = [], isLoading, isError } = useQuery({
    queryKey: ['workspace-audit', workspaceSlug],
    queryFn: () => getApiClient().get<AuditEvent[]>(`/api/v1/workspaces/${workspaceSlug}/audit`),
    enabled: Boolean(workspaceSlug),
    refetchInterval: 10_000,
  });

  if (isLoading) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--muted)]">加载中...</p></section>;
  if (isError) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--red)]">无法加载审计日志</p></section>;

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-[17px] font-extrabold text-[var(--ink)]">审计日志</h1>
      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] p-5">
          <div className="text-sm font-extrabold text-[var(--amber)]">还没有事件</div>
          <div className="mt-1 text-xs text-[var(--muted)]">WorkflowRun 执行时产生的事件会实时显示在这里。</div>
        </div>
      ) : (
        <div className="max-w-2xl">
          {events.map((event) => (
            <div key={event.stream_id} className="flex gap-3 border-b border-black/5 px-1 py-2.5">
              <span className="shrink-0 pt-0.5 font-mono text-[10px] text-[var(--subtle)]">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              <div>
                <Badge color={eventColor[event.event_type] ?? 'muted'}>{event.event_type}</Badge>
                <div className="mt-1 text-[12.5px] leading-5 text-[var(--ink)]">{eventDescription(event)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
