import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../features/onboarding/EmptyState.js';
import { FTUEWizard } from '../features/onboarding/FTUEWizard.js';
import { useWorkspaces } from '../hooks/useWorkspace.js';

export function WorkspacesPage() {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [showWizard, setShowWizard] = useState(false);

  if (isLoading) return <div className="p-6 text-sm text-[var(--muted)]">Loading...</div>;
  if (workspaces.length === 0 && !showWizard) return <EmptyState onStart={() => setShowWizard(true)} />;
  if (showWizard) return <FTUEWizard onComplete={() => setShowWizard(false)} />;

  return (
    <section className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 text-2xl font-semibold">Workspaces</h1>
        <Button variant="primary" onClick={() => setShowWizard(true)}>
          New
        </Button>
      </div>
      <div className="grid gap-2">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            className="rounded border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[var(--ink)] no-underline"
            to={`/w/${workspace.slug}`}
          >
            {workspace.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
