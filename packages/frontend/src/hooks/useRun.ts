import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface WorkflowStep {
  id: string;
  position: number;
  name: string;
  status: string;
  owner_type: 'human' | 'agent' | 'approval_gate';
  agent_role?: string;
  output_artifact_ids: string[];
}

export interface WorkflowRun {
  id: string;
  workspace_id: string;
  status: string;
  feature_branch?: string;
  steps: WorkflowStep[];
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => getApiClient().get<WorkflowRun>(`/api/v1/runs/${runId}`),
    enabled: Boolean(runId)
  });
}
