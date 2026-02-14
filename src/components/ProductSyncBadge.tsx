/**
 * Small badge overlay for product cards: synced ✓ / syncing ⟳ / pending ⚠ / failed ✕.
 * Tooltip on hover, click to retry when failed or pending.
 */

import { useState } from 'react';
import { Check, Loader2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';

export type ProductSyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

interface ProductSyncBadgeProps {
  status?: ProductSyncStatus | null;
  /** Optional error message for tooltip when status is error */
  errorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function ProductSyncBadge({ status, errorMessage, onRetry, className = '' }: ProductSyncBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (status === undefined || status === null) return null;

  const tooltipText =
    status === 'synced'
      ? 'Synced to server'
      : status === 'syncing'
        ? 'Syncing…'
        : status === 'pending'
          ? 'Pending sync'
          : errorMessage || 'Sync failed';

  const isRetryable = (status === 'error' || status === 'pending') && onRetry;

  const icon =
    status === 'synced' ? (
      <Check className="w-4 h-4 text-emerald-600" aria-hidden />
    ) : status === 'syncing' ? (
      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" aria-hidden />
    ) : status === 'pending' ? (
      <AlertCircle className="w-4 h-4 text-amber-600" aria-hidden />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" aria-hidden />
    );

  const bgClass =
    status === 'synced'
      ? 'bg-emerald-100'
      : status === 'syncing'
        ? 'bg-blue-100'
        : status === 'pending'
          ? 'bg-amber-100'
          : 'bg-red-100';

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className={`inline-flex items-center justify-center w-8 h-8 rounded-full shadow-sm border-2 border-white ${bgClass}`}
        title={tooltipText}
      >
        {isRetryable ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.();
            }}
            className="flex items-center justify-center w-full h-full rounded-full hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400"
            aria-label={`${tooltipText}. Retry sync`}
          >
            {status === 'error' ? (
              <RefreshCw className="w-4 h-4 text-red-600" aria-hidden />
            ) : (
              icon
            )}
          </button>
        ) : (
          icon
        )}
      </span>
      {showTooltip && (
        <div
          className="absolute z-10 px-2 py-1.5 text-xs font-medium text-white bg-slate-800 rounded shadow-lg whitespace-nowrap bottom-full left-1/2 -translate-x-1/2 mb-1.5 pointer-events-none"
          role="tooltip"
        >
          {tooltipText}
          {isRetryable && ' · Click to retry'}
        </div>
      )}
    </div>
  );
}
