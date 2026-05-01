import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface WorkflowStep {
  id: string;
  position: number;
  name: string;
  status: string;
  owner_type: 'human' | 'agent' | 'approval_gate';
  agent_role?: string;
  output_artifact_ids: string[];
  updated_at: string;
}

export interface WorkflowRun {
  id: string;
  workspace_id: string;
  status: string;
  feature_branch?: string;
  steps: WorkflowStep[];
}

export interface WorkflowRunSummary {
  id: string;
  workspace_id: string;
  status: string;
  feature_branch?: string;
}

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => getApiClient().get<WorkflowRun>(`/api/v1/runs/${runId}`),
    enabled: Boolean(runId)
  });
}

export function useWorkspaceRuns(workspaceIdOrSlug: string) {
  return useQuery({
    queryKey: ['workspace-runs', workspaceIdOrSlug],
    queryFn: () => getApiClient().get<WorkflowRunSummary[]>(`/api/v1/workspaces/${workspaceIdOrSlug}/runs`),
    enabled: Boolean(workspaceIdOrSlug)
  });
}

export function useCreateRun(workspaceIdOrSlug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      getApiClient().post<WorkflowRun>(`/api/v1/workspaces/${workspaceIdOrSlug}/runs`, {
        template_id: 'builtin-9step'
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace-runs', workspaceIdOrSlug] });
    }
  });
}
