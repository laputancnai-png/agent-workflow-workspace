import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  github_repo?: string;
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
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) =>
      getApiClient().post<Workspace>('/api/v1/workspaces', {
        name: input.name,
        slug: toSlug(input.name),
        githubRepoUrl: input.githubRepoUrl || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
