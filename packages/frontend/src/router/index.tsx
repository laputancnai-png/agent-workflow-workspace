import { createBrowserRouter, redirect } from 'react-router-dom';
import { AppShell } from '../layout/AppShell.js';
import { WorkspaceLayout } from '../layout/WorkspaceLayout.js';
import { LoginPage } from '../pages/LoginPage.js';
import { OAuthCallbackPage } from '../pages/OAuthCallbackPage.js';
import { RunnerMgmtPage } from '../pages/RunnerMgmtPage.js';
import { RunDetailPage } from '../pages/RunDetailPage.js';
import { SettingsPage } from '../pages/SettingsPage.js';
import { WorkspaceOverviewPage } from '../pages/WorkspaceOverviewPage.js';
import { WorkspacesPage } from '../pages/WorkspacesPage.js';
import { useAuthStore } from '../stores/auth.store.js';

function requireAuth() {
  const token = useAuthStore.getState().token;
  if (!token) throw redirect('/login');
  return null;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  {
    path: '/',
    loader: requireAuth,
    element: <AppShell />,
    children: [
      { index: true, loader: () => redirect('/workspaces') },
      { path: 'workspaces', element: <WorkspacesPage /> },
      {
        path: 'w/:workspaceSlug',
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <WorkspaceOverviewPage /> },
          { path: 'runs/:runId', element: <RunDetailPage /> },
          { path: 'runners', element: <RunnerMgmtPage /> },
          { path: 'settings', element: <SettingsPage /> }
        ]
      }
    ]
  }
]);
