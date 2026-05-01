import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/ui/Badge.js';
import { getApiClient } from '../lib/api-client.js';

interface ArtifactRow {
  id: string;
  role: string;
  status: string;
  title?: string | null;
  contentInline?: string | null;
  version: number;
  createdByType: string;
  createdAt: string;
}

const roleColor: Record<string, 'amber' | 'teal' | 'violet' | 'muted' | 'green'> = {
  PLAN: 'amber',
  CODE_PATCH: 'teal',
  TASK_LIST: 'violet',
  PRD: 'muted',
  TEST_REPORT: 'green',
  REVIEW_COMMENT: 'amber',
  PR_SUMMARY: 'teal',
  HUMAN_EDIT: 'muted',
};

function byteLabel(content?: string | null): string {
  if (!content) return '—';
  const bytes = new TextEncoder().encode(content).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function creatorLabel(type: string): string {
  if (type === 'human') return '👤 人工';
  if (type === 'agent') return '🤖 Agent';
  return `🤖 ${type}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ArtifactCard({ artifact }: { artifact: ArtifactRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = Boolean(artifact.contentInline);

  return (
    <div className="glass-panel p-4">
      <div className="mb-2 flex gap-1.5">
        <Badge color={roleColor[artifact.role] ?? 'muted'}>{artifact.role}</Badge>
        <Badge color={artifact.status === 'committed' ? 'green' : 'muted'}>{artifact.status}</Badge>
      </div>
      <div className="text-[13px] font-bold text-[var(--ink)]">{artifact.title ?? artifact.role}</div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--subtle)]">
        <Badge color="muted">v{artifact.version}</Badge>
        <span>{byteLabel(artifact.contentInline)}</span>
        <span>·</span>
        <span>{creatorLabel(artifact.createdByType)}</span>
        <span className="ml-auto font-mono">{formatDate(artifact.createdAt)}</span>
      </div>
      {hasContent ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mb-2 text-[11px] font-bold text-[var(--teal)] hover:underline"
          >
            {expanded ? '▲ 收起内容' : '▼ 展开内容'}
          </button>
          {expanded && (
            <div className="max-h-96 overflow-auto rounded-[8px] bg-black/[0.03] p-3 font-mono text-[11.5px] leading-6 text-[var(--ink)] whitespace-pre-wrap">
              {artifact.contentInline}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ArtifactsPage() {
  const { workspaceSlug = '' } = useParams<{ workspaceSlug: string }>();

  const { data: artifacts = [], isLoading, isError } = useQuery({
    queryKey: ['workspace-artifacts', workspaceSlug],
    queryFn: () => getApiClient().get<ArtifactRow[]>(`/api/v1/workspaces/${workspaceSlug}/artifacts`),
    enabled: Boolean(workspaceSlug),
  });

  if (isLoading) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--muted)]">加载中...</p></section>;
  if (isError) return <section className="h-full overflow-auto p-6"><p className="text-sm text-[var(--red)]">无法加载产物</p></section>;

  return (
    <section className="h-full overflow-auto p-6">
      <h1 className="mb-4 text-[17px] font-extrabold text-[var(--ink)]">产物</h1>
      {artifacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] p-5">
          <div className="text-sm font-extrabold text-[var(--amber)]">还没有产物</div>
          <div className="mt-1 text-xs text-[var(--muted)]">启动 WorkflowRun 后，Agent 产生的产物会显示在这里。</div>
        </div>
      ) : (
        <div className="flex max-w-xl flex-col gap-2">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </section>
  );
}
