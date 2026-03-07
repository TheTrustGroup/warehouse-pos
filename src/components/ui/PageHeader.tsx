import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Optional badge or extra content after the title (e.g. role label). */
  extra?: ReactNode;
  className?: string;
}

/**
 * Consistent page title and optional description. Use at the top of every main page.
 */
export function PageHeader({ title, description, extra, className = '' }: PageHeaderProps) {
  return (
    <div className={`animate-fade-in-up ${className}`}>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1
          className="text-2xl font-bold tracking-tight text-[var(--edk-ink)]"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {title}
        </h1>
        {extra}
      </div>
      {description && (
        <p className="text-[var(--edk-ink-2)] text-sm mt-0.5">
          {description}
        </p>
      )}
    </div>
  );
}
