import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'gray' | 'red' | 'blue';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  success:
    'bg-[var(--edk-green-bg)] text-[var(--edk-green)] border border-[var(--edk-green)]/20',
  warning:
    'bg-[var(--edk-amber-bg)] text-[var(--edk-amber)] border border-[var(--edk-amber)]/20',
  danger:
    'bg-red-50 text-red-600 border border-red-200',
  gray:
    'bg-[var(--edk-surface-2)] text-[var(--edk-ink-2)] border border-[var(--edk-border-mid)]',
  red:
    'bg-[var(--edk-red-soft)] text-[var(--edk-red)] border border-[var(--edk-red-border)]',
  blue:
    'bg-blue-50 text-blue-600 border border-blue-200',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[10px] rounded-[var(--edk-radius-sm)]',
  md: 'px-2.5 py-1 text-xs rounded-md',
};

export function Badge({
  children,
  variant = 'gray',
  size = 'md',
  className = '',
}: BadgeProps) {
  const variantClass = variantClasses[variant];
  const sizeClass = sizeClasses[size];
  return (
    <span
      className={`inline-flex items-center font-medium shrink-0 ${variantClass} ${sizeClass} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
