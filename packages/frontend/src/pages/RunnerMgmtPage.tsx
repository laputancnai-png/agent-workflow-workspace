import { useParams } from 'react-router-dom';
import { useRunners } from '../hooks/useRunners.js';
import { useSSEStore } from '../stores/sse.store.js';

const STATUS_STYLES: Record<string, string> = {
  online: 'bg-[var(--success-soft)] text-[var(--green)]',
  offline: 'bg-black/5 text-[var(--subtle)]',
  draining: 'bg-[var(--accent-soft)] text-[var(--amber)]',
};

const DOT_STYLES: Record<string, string> = {
  online: 'bg-[var(--green)]',
  offline: 'bg-[var(--muted)]',
  draining: 'bg-[var(--amber)]',
};

export function RunnerMgmtPage() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const { data: runners, isLoading } = useRunners(workspaceSlug ?? '');
  const runnerStatuses = useSSEStore((state) => state.runnerStatuses);

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-[17px] font-extrabold text-[var(--ink)]">Runners</h1>

      {isLoading ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : !runners?.length ? (
        <p className="text-sm text-[var(--muted)]">No runners registered for this workspace.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {runners.map((runner) => {
            const live = runnerStatuses[runner.id];
            const status = live?.status ?? runner.status;
            const dotClass = DOT_STYLES[status] ?? 'bg-[var(--muted)]';
            const badgeClass = STATUS_STYLES[status] ?? STATUS_STYLES.offline;

            return (
              <div
                key={runner.id}
                className="glass-panel flex items-center gap-3 px-4 py-3"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--ink)]">{runner.machine_id}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{runner.id}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(live?.capabilities ?? runner.capabilities).map((cap) => (
                    <span
                      key={cap}
                      className="rounded bg-white/50 px-1.5 py-0.5 text-xs text-[var(--muted)]"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>{status}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
