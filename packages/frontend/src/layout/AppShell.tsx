import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/common/LanguageToggle.js';
import { getApiClient } from '../lib/api-client.js';
import { useAuthStore } from '../stores/auth.store.js';
import { useWorkspace } from '../hooks/useWorkspace.js';
import { useRunners } from '../hooks/useRunners.js';

type NavItem = {
  id: string;
  label?: string;
  labelKey?: string;
  to: string;
  marker: string;
};

const navItems: NavItem[] = [
  { id: 'workspace', label: '工作区', to: '/w/demo', marker: '⬡' },
  { id: 'artifacts', label: '产物', to: '/w/demo/artifacts', marker: '◈' },
  { id: 'audit', label: '审计', to: '/w/demo/audit', marker: '◎' },
  { id: 'settings', labelKey: 'common:settings', to: '/w/demo/settings', marker: '⊙' }
];

function LogoMark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--surface-soft)] bg-white/55 shadow-sm">
      <svg width="27" height="27" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <line x1="6" y1="16" x2="14" y2="16" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
        <line x1="18" y1="16" x2="26" y2="16" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
        <circle cx="5" cy="16" r="3.2" fill="var(--agent-soft)" stroke="var(--teal)" strokeWidth="1.6" />
        <circle cx="16" cy="16" r="4.6" fill="var(--amber)" />
        <circle cx="16" cy="14.8" r="1.3" fill="white" />
        <path d="M13.8 18.8C14.6 17.5 17.4 17.5 18.2 18.8" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="27" cy="16" r="3.2" fill="var(--success-soft)" stroke="var(--green)" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const activeWorkspace = workspaceSlug ?? '';
  const { data: workspace } = useWorkspace(activeWorkspace);
  const { data: runners } = useRunners(activeWorkspace);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  const onlineRunner = runners?.find((r) => r.status === 'online');

  const handleLogout = async () => {
    try {
      await getApiClient().post('/api/v1/auth/logout');
    } finally {
      clearAuth();
      void navigate('/login');
    }
  };

  return (
    <div className="prototype-shell text-[var(--ink)]">
      <nav className="prototype-sidebar">
        <div className="flex items-center gap-2 px-2 pb-4 pt-0">
          <LogoMark />
          <span className="text-sm font-extrabold leading-none text-[var(--ink)]">AWW</span>
        </div>
        {activeWorkspace ? (
          <div className="mb-2 rounded-lg border border-[var(--accent-line)] bg-[var(--accent-soft)] px-2 py-1.5">
            <div className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--amber)]">当前项目</div>
            <div className="mt-0.5 text-[12.5px] font-bold text-[var(--ink)]">{workspace?.name ?? activeWorkspace}</div>
            <div className="text-[10.5px] text-[var(--subtle)]">{activeWorkspace}</div>
          </div>
        ) : null}
        <NavLink
          to={activeWorkspace ? `/w/${activeWorkspace}` : '/workspaces'}
          className={({ isActive }) => `prototype-nav-link ${isActive || Boolean(activeWorkspace) ? 'is-active' : ''}`}
        >
          <span className="text-[13px] opacity-75">⬡</span>
          工作区
        </NavLink>
        {activeWorkspace ? navItems.filter((item) => item.id !== 'workspace').map((item) => (
          <NavLink
            key={item.to}
            to={item.to.replace('/w/demo', `/w/${activeWorkspace}`)}
            title={item.labelKey ? t(item.labelKey) : item.label}
            className={({ isActive }) => `prototype-nav-link ${isActive ? 'is-active' : ''}`}
          >
            <span className="text-[13px] opacity-75">{item.marker}</span>
            {item.labelKey ? t(item.labelKey) : item.label}
          </NavLink>
        )) : null}
        <div className="mt-auto rounded-lg border border-black/5 bg-black/[0.04] p-2">
          {onlineRunner ? (
            <>
              <div className="mb-0.5 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
                <span className="text-[10px] font-bold text-[var(--green)]">Runner 在线</span>
              </div>
              <div className="font-mono text-[9.5px] text-[var(--subtle)]">{onlineRunner.machine_id}</div>
            </>
          ) : (
            <>
              <div className="mb-0.5 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]" />
                <span className="text-[10px] font-bold text-[var(--muted)]">Runner 离线</span>
              </div>
              <div className="font-mono text-[9.5px] text-[var(--subtle)]">无可用 Runner</div>
            </>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <LanguageToggle />
          <button
            type="button"
            onClick={() => { void handleLogout(); }}
            className="flex-1 rounded-lg border border-black/8 bg-black/[0.04] px-2 py-1.5 text-[10.5px] font-bold text-[var(--subtle)] hover:bg-black/[0.08] hover:text-[var(--ink)]"
            title="退出登录"
          >
            退出
          </button>
        </div>
      </nav>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
