import { createBrowserRouter, redirect } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage.js';
import { OAuthCallbackPage } from '../pages/OAuthCallbackPage.js';
import { PrototypeV2Page } from '../pages/PrototypeV2Page.js';
import { useAuthStore } from '../stores/auth.store.js';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  if (!token) return <LoginPage />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/', element: <RequireAuth><PrototypeV2Page /></RequireAuth> },
  { path: '/workspaces', element: <RequireAuth><PrototypeV2Page /></RequireAuth> },
  { path: '/w/*', element: <RequireAuth><PrototypeV2Page /></RequireAuth> },
  { path: '/login', element: <LoginPage /> },
  { path: '/oauth/callback', element: <OAuthCallbackPage /> },
  { path: '*', loader: () => redirect('/') },
]);
