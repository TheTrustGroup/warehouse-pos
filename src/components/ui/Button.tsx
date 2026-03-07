/**
 * Single source of truth for buttons. Use instead of raw <button> with btn-* classes.
 * Phase 3: loading, leftIcon, rightIcon, fullWidth. Variants: primary | secondary | ghost | danger (+ action*).
 */
import { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoadingSpinner } from './LoadingSpinner';

export type ButtonVariant = 'primary' | 'secondary' | 'action' | 'actionView' | 'actionEdit' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children: ReactNode;
  /** Show spinner and disable button */
  loading?: boolean;
  /** Icon before children */
  leftIcon?: ReactNode;
  /** Icon after children */
  rightIcon?: ReactNode;
  /** Full width (w-full) */
  fullWidth?: boolean;
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
  sm: 'text-sm px-4 py-2 min-h-0',
  md: '',
  lg: 'py-3.5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const base = variantClasses[variant];
  const sizeClass = sizeClasses[size];
  const widthClass = fullWidth ? 'w-full' : '';
  const flexClass = 'inline-flex items-center justify-center gap-2';
  const combined = [base, flexClass, sizeClass, widthClass, className].filter(Boolean).join(' ');
  const isDisabled = disabled ?? loading;

  return (
    <button
      type={type}
      className={combined}
      disabled={isDisabled}
      aria-busy={loading}
      {...rest}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <LoadingSpinner size="sm" />
          <span>{children}</span>
        </span>
      ) : (
        <>
          {leftIcon != null && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{leftIcon}</span>}
          {children}
          {rightIcon != null && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{rightIcon}</span>}
        </>
      )}
    </button>
  );
}
