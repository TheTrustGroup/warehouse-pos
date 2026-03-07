/**
 * Phase 3 design system: stat card for dashboards.
 * Value in IBM Plex Mono (26px); optional delta, icon, variant, loading skeleton, sub, onClick.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type StatCardVariant = 'default' | 'red' | 'green' | 'amber';

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Optional delta, e.g. "+12%" or "-3"; trend up/down can be derived from prefix or passed separately */
  delta?: string;
  /** Optional trend for visual indicator (up = green, down = red) */
  trend?: 'up' | 'down' | 'neutral';
  icon?: LucideIcon;
  variant?: StatCardVariant;
  /** Optional subtitle below value */
  sub?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

const variantValueColor: Record<StatCardVariant, string> = {
  default: 'text-[var(--edk-ink)]',
  red: 'text-[var(--edk-red)]',
  green: 'text-[var(--edk-green)]',
  amber: 'text-[var(--edk-amber)]',
};

export function StatCard({
  label,
  value,
  delta,
  trend,
  icon: Icon,
  variant = 'default',
  sub,
  loading = false,
  onClick,
  className = '',
}: StatCardProps) {
  const valueColor = variantValueColor[variant];
  const isInteractive = typeof onClick === 'function';

  if (loading) {
    return (
      <div
        className={`
          rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)]
          p-3 min-h-[80px] animate-pulse
          ${className}
        `.trim()}
        aria-busy="true"
      >
        <div className="h-3 w-16 rounded bg-[var(--edk-border-mid)] mb-2" />
        <div className="h-6 w-20 rounded bg-[var(--edk-border-mid)]" />
      </div>
    );
  }

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`
        rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)]
        p-3 transition-shadow duration-200
        ${isInteractive ? 'cursor-pointer hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--edk-red)] focus-visible:ring-offset-2' : ''}
        ${className}
      `.trim()}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--edk-ink-3)]">
          {label}
        </span>
        {Icon && (
          <span className="text-[var(--edk-ink-3)]" aria-hidden>
            <Icon className="w-4 h-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p
        className="mt-0.5 text-[20px] font-semibold tabular-nums leading-tight font-mono"
        style={{ fontFamily: "'IBM Plex Mono', 'SF Mono', Consolas, monospace" }}
        aria-label={`${label}: ${value}`}
      >
        <span className={valueColor}>{value}</span>
      </p>
      {(delta != null || trend) && (
        <p className="mt-0.5 text-[10px] font-medium flex items-center gap-1">
          {trend === 'up' && (
            <span className="text-[var(--edk-green)]" aria-hidden>↑</span>
          )}
          {trend === 'down' && (
            <span className="text-[var(--edk-red)]" aria-hidden>↓</span>
          )}
          {delta != null && (
            <span
              className={
                trend === 'up'
                  ? 'text-[var(--edk-green)]'
                  : trend === 'down'
                    ? 'text-[var(--edk-red)]'
                    : 'text-[var(--edk-ink-2)]'
              }
            >
              {delta}
            </span>
          )}
        </p>
      )}
      {sub != null && (
        <div className="mt-1 text-[10px] text-[var(--edk-ink-3)]">{sub}</div>
      )}
    </div>
  );
}
