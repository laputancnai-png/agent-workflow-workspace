import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from '../components/common/LanguageToggle.js';

const navItems = [
  { labelKey: 'workflow:workspace', to: '/workspaces', marker: 'W' },
  { labelKey: 'common:settings', to: '/w/demo/settings', marker: 'S' }
];

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="grid h-screen grid-cols-[72px_1fr] bg-[var(--bg)] text-[var(--ink)]">
      <nav className="flex flex-col items-center gap-2 border-r border-[var(--line)] bg-[var(--surface)] px-0 py-4">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded border border-[var(--line-strong)] text-sm font-bold text-[var(--blue)]">
          A
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={t(item.labelKey)}
            className={({ isActive }) =>
              `flex h-10 w-10 items-center justify-center rounded text-sm font-semibold transition-colors ${
                isActive ? 'bg-[var(--surface-soft)] text-[var(--ink)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'
              }`
            }
          >
            {item.marker}
          </NavLink>
        ))}
        <div className="mt-auto">
          <LanguageToggle />
        </div>
      </nav>
      <main className="min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
