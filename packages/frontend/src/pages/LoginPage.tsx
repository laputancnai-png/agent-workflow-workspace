import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth.store.js';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
const IS_DEV = import.meta.env.DEV;

export function LoginPage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('test@example.com');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGitHubLogin = () => {
    window.location.href = `${BACKEND_URL}/api/v1/auth/login`;
  };

  const handleTestLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/test-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json() as { data?: { access_token: string; user: { id: string; login: string; email: string; preferred_language: 'zh-CN' | 'en' } }; error?: string };
      if (!res.ok || !json.data) {
        setError(json.error ?? 'test-login failed');
        return;
      }
      const { access_token, user } = json.data;
      setAuth(access_token, { id: user.id, name: user.login, email: user.email, preferred_language: user.preferred_language });
      navigate('/workspaces');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--ink)]">
      <section className="w-full max-w-sm">
        <p className="mb-3 text-sm font-medium uppercase text-[var(--teal)]">AWW</p>
        <h1 className="text-3xl font-semibold">{t('app_title')}</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Agent Workflow Workspace — human-in-the-loop AI delivery.</p>
        <button
          type="button"
          onClick={handleGitHubLogin}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded bg-[var(--ink)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] transition-opacity hover:opacity-80"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Login with GitHub
        </button>

        {IS_DEV && (
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <p className="mb-2 text-xs text-[var(--muted)]">Dev: test login</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--teal)]"
              placeholder="email"
            />
            {error && <p className="mt-1 text-xs text-[var(--red)]">{error}</p>}
            <button
              type="button"
              onClick={handleTestLogin}
              disabled={loading}
              className="mt-2 w-full rounded border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)] transition-colors hover:border-[var(--teal)] hover:text-[var(--teal)] disabled:opacity-50"
            >
              {loading ? 'Logging in…' : 'Test Login'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
