import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  githubRepoUrl?: string | null;
  defaultBranch?: string;
  initialPrd?: string | null;
  preferredProvider?: string;
  preferredModel?: string;
}

export function useWorkspace(id: string) {
  return useQuery({
    queryKey: ['workspace', id],
    queryFn: () => getApiClient().get<Workspace>(`/api/v1/workspaces/${id}`),
    enabled: Boolean(id)
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => getApiClient().get<Workspace[]>('/api/v1/workspaces')
  });
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'workspace';
}

interface CreateWorkspaceInput {
  name: string;
  githubRepoUrl?: string;
  initialPrd?: string;
  preferredProvider?: string;
  preferredModel?: string;
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => {
      let githubRepoUrl: string | undefined;
      if (input.githubRepoUrl) {
        const raw = input.githubRepoUrl.trim();
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
          githubRepoUrl = raw;
        } else if (raw.includes('/')) {
          githubRepoUrl = `https://github.com/${raw}`;
        }
      }
      return getApiClient().post<Workspace>('/api/v1/workspaces', {
        name: input.name,
        slug: toSlug(input.name),
        githubRepoUrl,
        initialPrd: input.initialPrd?.trim() || undefined,
        preferredProvider: input.preferredProvider ?? 'openclaw',
        preferredModel: input.preferredModel ?? 'openclaw-local',
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
