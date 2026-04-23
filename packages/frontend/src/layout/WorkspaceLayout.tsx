import { Outlet, useParams } from 'react-router-dom';
import { useSSEConnection } from '../hooks/useSSEConnection.js';
import { useAuthStore } from '../stores/auth.store.js';

export function WorkspaceLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const token = useAuthStore((state) => state.token);

  useSSEConnection(workspaceSlug ?? '', token);

  return <Outlet />;
}
