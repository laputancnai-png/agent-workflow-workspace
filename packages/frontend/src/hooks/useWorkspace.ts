import { useQuery } from '@tanstack/react-query';
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
