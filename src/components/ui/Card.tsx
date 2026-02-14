/**
 * Single source of truth for card surfaces. Wraps content with glass-card styling.
 * Use instead of raw <div className="glass-card ...">.
 */
import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding: none, compact, default, or loose. */
  padding?: 'none' | 'compact' | 'default' | 'loose';
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
  className = '',
  children,
  ...rest
}: CardProps) {
  const pad = paddingClasses[padding];
  const combined = ['glass-card', pad, className].filter(Boolean).join(' ');
  return (
    <div className={combined} {...rest}>
      {children}
    </div>
  );
}
