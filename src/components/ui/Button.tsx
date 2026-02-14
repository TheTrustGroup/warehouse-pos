/**
 * Single source of truth for buttons. Use instead of raw <button> with btn-* classes.
 * Variants map to design tokens: primary, secondary, action (icon/ghost), danger (destructive).
 * Phase 6: default (md) keeps min-height 44px for thumb-friendly CTAs; sm is for compact contexts only.
 */
import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'action' | 'actionView' | 'actionEdit' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  /** Optional size; action/danger often use default (min touch target). */
  size?: 'sm' | 'md' | 'lg';
  /** Extra class names (e.g. w-full, inline-flex gap-2). */
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  action: 'btn-action',
  actionView: 'btn-action btn-action-view',
  actionEdit: 'btn-action btn-action-edit',
  danger: 'btn-action btn-action-delete',
  ghost: 'min-h-[var(--touch-min)] inline-flex items-center justify-center rounded-lg font-medium transition-colors text-primary-600 hover:bg-primary-50/80 border border-primary-200/30',
};

const sizeClasses = {
  sm: 'text-sm px-4 py-2 min-h-0', /* compact only; prefer md for primary actions (44px min) */
  md: '',
  lg: 'py-3.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const base = variantClasses[variant];
  const sizeClass = sizeClasses[size];
  const combined = [base, sizeClass, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={combined} {...rest}>
      {children}
    </button>
  );
}
