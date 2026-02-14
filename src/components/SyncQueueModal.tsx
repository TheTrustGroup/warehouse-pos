/**
 * Modal listing sync queue items with actions: Retry All, Retry Individual, Clear Failed, View Details.
 * Real-time updates via useLiveQuery.
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, retryQueueItem, clearFailedQueueItems } from '../db/inventoryDB';
import { syncService } from '../services/syncService';
import { Button } from './ui/Button';
import { X, RefreshCw, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type QueueItem = {
  id: number;
  operation: string;
  tableName: string;
  data: Record<string, unknown>;
  timestamp: number;
  attempts: number;
  error?: string;
  status: string;
};

export function SyncQueueModal({ isOpen, onClose }: SyncQueueModalProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  const items = useLiveQuery(
    async () => {
      const all = await db.syncQueue.orderBy('timestamp').toArray();
      return all as QueueItem[];
    },
    [isOpen]
  ) as QueueItem[] | undefined;

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const list = items ?? [];
  const failedCount = list.filter((i) => i.status === 'failed').length;

  const handleRetryAll = async () => {
    setRetryingAll(true);
    try {
      await syncService.processSyncQueue();
    } finally {
      setRetryingAll(false);
    }
  };

  const handleRetryOne = async (queueId: number) => {
    setRetryingId(queueId);
    try {
      await retryQueueItem(queueId);
      await syncService.processSyncQueue();
    } finally {
      setRetryingId(null);
    }
  };

  const handleClearFailed = async () => {
    await clearFailedQueueItems();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 solid-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-queue-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 id="sync-queue-title" className="text-lg font-semibold text-slate-900">
            Sync queue
          </h2>
          <Button type="button" variant="ghost" onClick={onClose} className="rounded-lg min-w-10 min-h-10" aria-label="Close">
            <X className="w-5 h-5 text-slate-600" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleRetryAll}
            disabled={retryingAll || list.length === 0}
            className="inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${retryingAll ? 'animate-spin' : ''}`} />
            Retry all
          </Button>
          {isAdmin && failedCount > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={handleClearFailed} className="inline-flex items-center gap-2 text-red-600 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
              Clear failed ({failedCount})
            </Button>
          )}
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 p-4">
          {list.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-8">Queue is empty. All changes are synced.</p>
          ) : (
            <ul className="space-y-2">
              {list.map((item) => {
                const isExpanded = expandedId === item.id;
                const label = item.data?.name ?? item.data?.sku ?? item.data?.id ?? `Item ${item.id}`;
                return (
                  <li
                    key={item.id}
                    className={`rounded-xl border text-left overflow-hidden ${
                      item.status === 'failed' ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-slate-800 capitalize">{item.operation}</span>
                        <span className="text-slate-500 text-sm ml-2 truncate block">{String(label)}</span>
                        {item.error && (
                          <p className="text-red-600 text-xs mt-0.5 truncate" title={item.error}>
                            {item.error}
                          </p>
                        )}
                        <p className="text-slate-400 text-xs">
                          Attempts: {item.attempts} · {item.status}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {(item.status === 'failed' || item.status === 'pending') && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRetryOne(item.id)}
                            disabled={retryingId === item.id || retryingAll}
                            className="p-2 min-h-0"
                            title="Retry this item"
                          >
                            <RefreshCw className={`w-4 h-4 ${retryingId === item.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                          aria-expanded={isExpanded}
                          title={isExpanded ? 'Hide details' : 'View details'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <pre className="px-3 py-2 bg-slate-900 text-slate-100 text-xs overflow-x-auto max-h-48 overflow-y-auto border-t border-slate-700">
                        {JSON.stringify(item.data, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
