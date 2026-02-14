/**
 * Single source of truth for card surfaces. Uses centralized glassmorphism (glass-card, glass-hover, gradient border).
 */
import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding: none, compact, default, or loose. */
  padding?: 'none' | 'compact' | 'default' | 'loose';
  /** Disable hover morph and gradient border (e.g. for static or dense lists). */
  flat?: boolean;
  children: ReactNode;
}

const paddingClasses = {
  none: '',
  compact: 'p-4',
  default: 'p-5',
  loose: 'p-6',
};

export function Card({
  padding = 'default',
  flat = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const pad = paddingClasses[padding];
  const glassClasses = flat
    ? 'glass-card'
    : 'glass-card glass-hover glass-border-gradient';
  const combined = [glassClasses, pad, className].filter(Boolean).join(' ');
  return (
    <div className={combined} {...rest}>
      {children}
    </div>
  );
}
