import { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent empty state for lists and data views.
 * Use when there are no items to show (e.g. no orders, no products).
 */
export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 solid-card max-w-md mx-auto ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <Icon className="w-7 h-7 text-slate-400" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-slate-900 mb-2">{title}</h2>
      {description && <p className="text-slate-600 text-sm mb-6">{description}</p>}
      {action && <div className="flex justify-center">{action}</div>}
    </div>
  );
}
