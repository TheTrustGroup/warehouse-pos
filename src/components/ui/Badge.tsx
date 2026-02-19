import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  className?: string;
}

export function Badge({ children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 text-sm font-medium shrink-0 ${className}`.trim()}
    >
      {children}
    </span>
  );
}
