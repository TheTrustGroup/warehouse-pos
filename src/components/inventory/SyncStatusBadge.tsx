import { Loader2, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

type SyncStatus = 'synced' | 'pending' | 'error';

interface SyncStatusBadgeProps {
  status?: SyncStatus | null;
  syncErrorMessage?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function SyncStatusBadge({ status, syncErrorMessage, onRetry, className = '' }: SyncStatusBadgeProps) {
  if (status === 'synced') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-medium ${className}`}
        title="Synced to server"
      >
        <Check className="w-3.5 h-3.5" aria-hidden />
        Synced
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium ${className}`}
        title="Syncing to server…"
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
        Syncing…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-xs font-medium"
          title={syncErrorMessage ?? 'Sync failed'}
        >
          <AlertTriangle className="w-3.5 h-3.5" aria-hidden />
          Sync failed
        </span>
        {onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
            className="p-1 min-h-0 h-6 text-amber-700 hover:bg-amber-100"
            title="Retry sync"
            aria-label="Retry sync"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        )}
      </span>
    );
  }
  return null;
}
