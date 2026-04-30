import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Runner {
  id: string;
  workspace_id: string;
  machine_id: string;
  status: 'online' | 'offline' | 'draining';
  capabilities: string[];
  last_heartbeat_at: string | null;
  created_at: string;
}

export function useRunners(workspaceId: string) {
  return useQuery({
    queryKey: ['runners', workspaceId],
    queryFn: () => getApiClient().get<Runner[]>(`/api/v1/workspaces/${workspaceId}/runners`),
    enabled: Boolean(workspaceId),
    refetchInterval: 30_000,
  });
}
