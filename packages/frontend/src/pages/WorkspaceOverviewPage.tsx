import { Link, useNavigate, useParams } from 'react-router-dom';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { useCreateRun, useWorkspaceRuns, type WorkflowRunSummary } from '../hooks/useRun.js';
import { useWorkspace } from '../hooks/useWorkspace.js';

const stepPreview = [
  ['01', 'PRD', 'Human'],
  ['02', 'Plan', 'Agent'],
  ['03', 'Approval', 'Human'],
  ['04', 'Tasks', 'Agent'],
  ['05', 'Code', 'Agent'],
  ['06', 'Test', 'Agent'],
  ['07', 'Review', 'Agent'],
  ['08', 'Final', 'Human'],
  ['09', 'PR', 'Agent']
];

function statusBadge(run: WorkflowRunSummary) {
  if (run.status === 'completed') return <Badge color="green">Completed</Badge>;
  if (run.status === 'failed') return <Badge color="red">Failed</Badge>;
  if (run.status === 'running') return <Badge color="teal">Running</Badge>;
  return <Badge color="amber">{run.status}</Badge>;
}

export function WorkspaceOverviewPage() {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const navigate = useNavigate();
  const { data: workspace, isLoading: isWorkspaceLoading, isError: isWorkspaceError } = useWorkspace(workspaceSlug);
  const { data: runs = [], isLoading: areRunsLoading, isError: areRunsError } = useWorkspaceRuns(workspaceSlug);
  const { mutateAsync: createRun, isPending: isCreatingRun } = useCreateRun(workspaceSlug);

  const handleCreateRun = async () => {
    const run = await createRun();
    navigate(`/w/${workspaceSlug}/runs/${run.id}`);
  };

  if (isWorkspaceLoading || areRunsLoading) {
    return <div className="p-6 text-sm text-[var(--muted)]">Loading...</div>;
  }

  if (isWorkspaceError || areRunsError || !workspace) {
    return <div className="p-6 text-sm font-semibold text-[var(--red)]">Could not load workspace.</div>;
  }

  return (
    <section className="h-full overflow-auto p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">Workspace</div>
          <h1 className="m-0 text-[22px] font-extrabold text-[var(--ink)]">{workspace.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge color="muted">{workspace.slug}</Badge>
            {workspace.githubRepoUrl ? <Badge color="teal">{workspace.githubRepoUrl.replace('https://github.com/', '')}</Badge> : null}
            <Badge color="amber">{workspace.preferredProvider ?? 'anthropic'}</Badge>
          </div>
        </div>
        <Button variant="primary" onClick={handleCreateRun} disabled={isCreatingRun}>
          {isCreatingRun ? 'Starting...' : 'New WorkflowRun'}
        </Button>
      </div>

      <div className="prototype-panel mb-4 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-extrabold text-[var(--ink)]">PRD to PR delivery flow</div>
            <div className="mt-1 text-xs text-[var(--subtle)]">9-step human-in-the-loop workflow</div>
          </div>
          <Badge color="green">{runs.length} runs</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-9">
          {stepPreview.map(([position, label, owner]) => (
            <div key={position} className="rounded-lg border border-black/5 bg-white/55 px-3 py-2">
              <div className="mb-1 font-mono text-[11px] font-bold text-[var(--subtle)]">{position}</div>
              <div className="text-[12.5px] font-extrabold text-[var(--ink)]">{label}</div>
              <div className="mt-1 text-[11px] text-[var(--muted)]">{owner}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="prototype-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-extrabold text-[var(--ink)]">WorkflowRuns</h2>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] p-5">
            <div className="mb-2 text-sm font-extrabold text-[var(--amber)]">No WorkflowRuns yet</div>
            <Button variant="primary" onClick={handleCreateRun} disabled={isCreatingRun}>
              {isCreatingRun ? 'Starting...' : 'Start first WorkflowRun'}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            {runs.map((run) => (
              <Link
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/5 bg-white/60 px-4 py-3 text-[var(--ink)] no-underline transition hover:border-[var(--accent-line)] hover:bg-white/80"
                to={`/w/${workspace.slug}/runs/${run.id}`}
              >
                <div>
                  <div className="font-mono text-[12px] font-extrabold">{run.id}</div>
                  <div className="mt-1 text-[11px] text-[var(--subtle)]">{run.feature_branch ?? 'branch pending'}</div>
                </div>
                {statusBadge(run)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
