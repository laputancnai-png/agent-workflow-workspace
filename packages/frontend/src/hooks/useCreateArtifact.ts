import { useMutation } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

interface CreateArtifactInput {
  role: 'HUMAN_EDIT';
  step_id?: string;
  parent_artifact_id?: string;
  content_inline: string;
}

interface CreatedArtifact {
  id: string;
  role: string;
  status: string;
}

export function useCreateArtifact() {
  return useMutation({
    mutationFn: (input: CreateArtifactInput) =>
      getApiClient().post<CreatedArtifact>('/api/v1/artifacts', input),
  });
}
