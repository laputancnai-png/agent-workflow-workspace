import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button.js';
import { EmptyState } from '../features/onboarding/EmptyState.js';
import { FTUEWizard } from '../features/onboarding/FTUEWizard.js';
import { useWorkspaces, useCreateWorkspace } from '../hooks/useWorkspace.js';

export function WorkspacesPage() {
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const { mutateAsync: createWorkspace, isPending: isCreating } = useCreateWorkspace();
  const [showWizard, setShowWizard] = useState(false);
  const [createError, setCreateError] = useState('');
  const navigate = useNavigate();

  const handleWizardComplete = async (data: { name: string; github_repo: string; prd: string }) => {
    setCreateError('');
    try {
      const workspace = await createWorkspace({
        name: data.name,
        githubRepoUrl: data.github_repo || undefined,
        initialPrd: data.prd,
        preferredProvider: 'openclaw',
        preferredModel: 'openclaw-local',
      });
      setShowWizard(false);
      navigate(`/w/${workspace.slug}`);
    } catch {
      setCreateError('Could not create workspace. Check that the backend is running and try again.');
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-[var(--muted)]">Loading...</div>;
  if (workspaces.length === 0 && !showWizard) return <EmptyState onStart={() => setShowWizard(true)} />;
  if (showWizard) {
    return (
      <div className="relative h-full">
        <FTUEWizard onComplete={handleWizardComplete} isSubmitting={isCreating} error={createError} />
      </div>
    );
  }

  return (
    <section className="h-full overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 text-[17px] font-extrabold text-[var(--ink)]">Workspaces</h1>
        <Button variant="primary" onClick={() => setShowWizard(true)}>
          New
        </Button>
      </div>
      <div className="grid gap-2">
        {workspaces.map((workspace) => (
          <Link
            key={workspace.id}
            className="glass-panel px-4 py-3 text-[var(--ink)] no-underline"
            to={`/w/${workspace.slug}`}
          >
            {workspace.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
