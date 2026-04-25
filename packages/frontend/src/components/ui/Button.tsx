import { type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}

const variants = {
  primary: 'bg-[var(--blue)] text-white hover:opacity-90',
  secondary: 'border border-[var(--line)] text-[var(--ink)] hover:border-[var(--line-strong)]',
  danger: 'danger border border-[var(--red)] text-[var(--red)] hover:bg-[var(--red)] hover:text-white',
  ghost: 'text-[var(--muted)] hover:text-[var(--ink)]'
};

const sizes = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm'
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}
