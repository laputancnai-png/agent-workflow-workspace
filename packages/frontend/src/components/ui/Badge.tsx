import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: 'green' | 'amber' | 'red' | 'teal' | 'violet' | 'muted';
}

const colors = {
  green: 'bg-green-900/30 text-green-400',
  amber: 'bg-amber-900/30 text-amber-400',
  red: 'bg-red-900/30 text-red-400',
  teal: 'bg-teal-900/30 text-teal-400',
  violet: 'bg-violet-900/30 text-violet-400',
  muted: 'bg-gray-800 text-gray-400'
};

export function Badge({ children, color = 'muted' }: BadgeProps) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${colors[color]}`}>{children}</span>;
}
