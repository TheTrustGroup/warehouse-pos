/**
 * Single source of truth for card surfaces. Uses solid-card for interactive/readable surfaces (no blur).
 */
import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding: none, compact, default, or loose. */
  padding?: 'none' | 'compact' | 'default' | 'loose';
  /** Disable hover elevation (e.g. for static or dense lists). */
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
  const cardClasses = flat
    ? 'solid-card'
    : 'solid-card hover:shadow-xl transition-shadow duration-200';
  const combined = [cardClasses, pad, className].filter(Boolean).join(' ');
  return (
    <div className={combined} {...rest}>
      {children}
    </div>
  );
}
