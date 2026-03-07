import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Phase 3: Empty state using --edk-* tokens and Barlow Condensed for title.
 * Use when there are no items to show (e.g. no orders, no products).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`
        flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto
        rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)]
        ${className}
      `.trim()}
      role="status"
      aria-live="polite"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'var(--edk-surface-2)', color: 'var(--edk-ink-3)' }}
      >
        <Icon className="w-7 h-7" strokeWidth={2} aria-hidden />
      </div>
      <h2
        className="text-lg font-semibold mb-2"
        style={{ color: 'var(--edk-ink)', fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {title}
      </h2>
      {description && (
        <p className="text-sm mb-6" style={{ color: 'var(--edk-ink-2)' }}>
          {description}
        </p>
      )}
      {action != null && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
