import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore, type User } from '../stores/auth.store.js';

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  useEffect(() => {
    const token = params.get('token');
    const user = params.get('user');
    if (token && user) {
      setAuth(token, JSON.parse(decodeURIComponent(user)) as User);
      navigate('/workspaces');
    }
  }, [navigate, params, setAuth]);

  return <div className="p-6 text-sm text-[var(--muted)]">Authenticating...</div>;
}
