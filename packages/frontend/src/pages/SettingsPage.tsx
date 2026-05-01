import { useParams } from 'react-router-dom';
import { useWorkspace } from '../hooks/useWorkspace.js';

export function SettingsPage() {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();
  const { data: workspace, isLoading, isError } = useWorkspace(workspaceSlug);

  if (isLoading) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--muted)]">加载中...</p></section>;
  if (isError || !workspace) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--red)]">无法加载 Workspace 设置</p></section>;

  const repoDisplay = workspace.githubRepoUrl
    ? workspace.githubRepoUrl.replace('https://', '')
    : '未设置';

  const localPath = `~/.aww/repos/${workspace.slug}`;

  const rows = [
    ['工作区名称', workspace.name],
    ['Slug', workspace.slug],
    ['GitHub 仓库', repoDisplay],
    ['本地路径', localPath],
    ['默认分支', workspace.defaultBranch ?? 'main'],
    ['AI 模型', workspace.preferredModel ?? 'openclaw-local'],
    ['AI Provider', workspace.preferredProvider ?? 'openclaw'],
  ];

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-[17px] font-extrabold text-[var(--ink)]">设置</h1>
      <div className="flex max-w-lg flex-col gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="glass-panel p-4">
            <div className="mb-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--subtle)]">{label}</div>
            <div className="font-mono text-[13px] text-[var(--ink)]">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
