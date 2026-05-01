import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export type DecisionAction = 'approve' | 'reject' | 'request_changes' | 'edit' | 'take_over' | 'rerun';

interface SubmitDecisionInput {
  stepId: string;
  runId?: string;
  action: DecisionAction;
  comment?: string;
  artifact_content?: string;
  edited_artifact_id?: string;
}

export function useSubmitDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stepId, runId: _runId, ...body }: SubmitDecisionInput) =>
      getApiClient().post(`/api/v1/steps/${stepId}/decision`, body),
    onSuccess: (_data, { stepId, runId }) => {
      void queryClient.invalidateQueries({ queryKey: ['step', stepId] });
      if (runId) void queryClient.invalidateQueries({ queryKey: ['run', runId] });
    }
  });
}
