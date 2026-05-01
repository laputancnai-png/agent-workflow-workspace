import { useQuery } from '@tanstack/react-query';
import { getApiClient } from '../lib/api-client.js';

export interface Artifact {
  id: string;
  role: string;
  status: string;
  contentInline?: string;
  title?: string;
  version: number;
  createdAt: string;
}

export function useArtifact(artifactId: string) {
  return useQuery({
    queryKey: ['artifact', artifactId],
    queryFn: () => getApiClient().get<Artifact>(`/api/v1/artifacts/${artifactId}`),
    enabled: Boolean(artifactId)
  });
}
