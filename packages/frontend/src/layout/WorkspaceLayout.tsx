import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { requestNotificationPermission } from '../hooks/useNotifications.js';
import { useSSEConnection } from '../hooks/useSSEConnection.js';
import { useAuthStore } from '../stores/auth.store.js';

export function WorkspaceLayout() {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const token = useAuthStore((state) => state.token);

  useSSEConnection(workspaceSlug ?? '', token);

  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  return <Outlet />;
}
