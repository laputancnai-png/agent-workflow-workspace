import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export type DecisionAction = 'approve' | 'reject' | 'request_changes' | 'edit' | 'take_over';

interface SubmitDecisionInput {
  stepId: string;
  action: DecisionAction;
  comment?: string;
  edited_artifact_id?: string;
}

export function useSubmitDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stepId, ...body }: SubmitDecisionInput) =>
      getApiClient().post(`/api/v1/steps/${stepId}/decision`, body),
    onSuccess: (_data, { stepId }) => {
      queryClient.invalidateQueries({ queryKey: ['step', stepId] });
    }
  });
}
