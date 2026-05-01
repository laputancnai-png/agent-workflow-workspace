import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: 'green' | 'amber' | 'red' | 'teal' | 'violet' | 'muted';
}

const colors = {
  green: 'bg-[var(--success-soft)] text-[var(--green)]',
  amber: 'bg-[var(--accent-soft)] text-[var(--amber)]',
  red: 'bg-[var(--danger-soft)] text-[var(--red)]',
  teal: 'bg-[var(--agent-soft)] text-[var(--teal)]',
  violet: 'bg-violet-50 text-[var(--violet)]',
  muted: 'bg-black/5 text-[var(--subtle)]'
};

export function Badge({ children, color = 'muted' }: BadgeProps) {
  return <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${colors[color]}`}>{children}</span>;
}
