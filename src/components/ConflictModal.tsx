/**
 * Conflict resolution modal: shown when sync detects 409 or server updatedAt > local lastModified.
 * Side-by-side comparison, diff highlighting, resolution options, and optional "use for future" preference.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { X, Save, Server, Monitor, GitMerge, Clock } from 'lucide-react';
import { getConflictPreference, setConflictPreference, appendConflictAuditLog } from '../db/inventoryDB';

export type ConflictStrategy = 'keep_local' | 'keep_server' | 'merge' | 'last_write_wins';

export interface ConflictVersion {
  id?: string;
  name?: string;
  sku?: string;
  category?: string;
  price?: number;
  quantity?: number;
  description?: string;
  barcode?: string;
  lastModified?: number;
  updatedAt?: string | number;
  [key: string]: unknown;
}

export interface ConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Local (queued) version. */
  localVersion: ConflictVersion;
  /** Server version (from GET or 409 response). */
  serverVersion: ConflictVersion | null;
  /** If true, server returned 404 / item was deleted on server. */
  serverDeleted?: boolean;
  /** If true, queue operation is DELETE (we deleted locally). */
  localDeleted?: boolean;
  queueItemId?: number;
  operation?: string;
  /** Called with chosen strategy and optional merged payload (for merge). */
  onResolve: (strategy: ConflictStrategy, mergedPayload?: ConflictVersion) => void | Promise<void>;
}

const COMPARE_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'sku', label: 'SKU' },
  { key: 'category', label: 'Category' },
  { key: 'price', label: 'Price' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'description', label: 'Description' },
  { key: 'barcode', label: 'Barcode' },
] as const;

function formatTs(version: ConflictVersion): string {
  const ms =
    typeof version.lastModified === 'number'
      ? version.lastModified
      : typeof version.updatedAt === 'number'
        ? version.updatedAt
        : version.updatedAt
          ? new Date(version.updatedAt as string).getTime()
          : 0;
  return ms ? new Date(ms).toLocaleString() : '—';
}

function getFieldValue(obj: ConflictVersion, key: string): string | number {
  const v = obj[key];
  if (v === undefined || v === null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ConflictModal({
  isOpen,
  onClose,
  localVersion,
  serverVersion,
  serverDeleted = false,
  localDeleted = false,
  queueItemId,
  operation,
  onResolve,
}: ConflictModalProps) {
  const [useForFuture, setUseForFuture] = useState(false);
  const [strategyForFuture, setStrategyForFuture] = useState<ConflictStrategy | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergedForm, setMergedForm] = useState<ConflictVersion>(() => ({
    ...localVersion,
    ...(serverVersion && { ...serverVersion, price: (serverVersion as Record<string, unknown>).sellingPrice ?? serverVersion.price }),
  }));
  const conflictIdRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    const id = queueItemId ?? localVersion.id ?? serverVersion?.id;
    if (id !== conflictIdRef.current) {
      conflictIdRef.current = id;
      setMergedForm({
        ...localVersion,
        ...(serverVersion && { ...serverVersion, price: (serverVersion as Record<string, unknown>).sellingPrice ?? serverVersion.price }),
      });
    }
  }, [queueItemId, localVersion, serverVersion]);

  const serverDisplay = useMemo(() => {
    if (!serverVersion) return {} as ConflictVersion;
    return {
      ...serverVersion,
      price: (serverVersion as Record<string, unknown>).sellingPrice ?? serverVersion.price,
    };
  }, [serverVersion]);
  const diffs = useMemo(() => {
    const map: Record<string, { local: string | number; server: string | number; same: boolean }> = {};
    for (const { key } of COMPARE_FIELDS) {
      const local = getFieldValue(localVersion, key);
      const server = getFieldValue(serverDisplay, key);
      map[key] = { local, server, same: String(local) === String(server) };
    }
    return map;
  }, [localVersion, serverDisplay]);

  const handleResolve = async (strategy: ConflictStrategy, payload?: ConflictVersion) => {
    if (useForFuture && strategyForFuture) {
      await setConflictPreference(strategyForFuture);
    }
    const productId = localVersion.id ?? serverVersion?.id ?? queueItemId?.toString() ?? 'unknown';
    const localTs =
      typeof localVersion.lastModified === 'number'
        ? localVersion.lastModified
        : localVersion.updatedAt
          ? new Date(localVersion.updatedAt as string).getTime()
          : 0;
    const serverTs =
      serverVersion && (typeof serverVersion.updatedAt === 'number'
        ? serverVersion.updatedAt
        : serverVersion.updatedAt
          ? new Date(serverVersion.updatedAt as string).getTime()
          : 0);
    await appendConflictAuditLog({
      productId: String(productId),
      strategy,
      localUpdatedAt: localTs || undefined,
      serverUpdatedAt: serverTs || undefined,
      resolvedAt: Date.now(),
    });
    await onResolve(strategy, payload);
    onClose();
  };

  // Edge case: both versions identical → suggest auto-resolve (caller can pass identical and we show "Keep Server" as one-click)
  const identical = useMemo(() => {
    return COMPARE_FIELDS.every(({ key }) => diffs[key].same);
  }, [diffs]);

  // Edge case: item deleted on server
  if (serverDeleted && isOpen) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} titleId="conflict-modal-title" overlayClassName="z-[75]">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 id="conflict-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Item deleted on server
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            This item was deleted on the server. You can keep your local copy and re-push it, or remove it locally.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleResolve('keep_local')}
              variant="primary"
            >
              Keep local copy
            </Button>
            <Button
              onClick={() => handleResolve('keep_server')}
              variant="secondary"
            >
              Remove locally
            </Button>
            <Button onClick={onClose} variant="ghost">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // Edge case: we deleted locally (DELETE in queue) — normally we just remove from queue; modal might not show. If we do show, offer "Confirm delete" / "Keep on server"
  if (localDeleted && isOpen) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} titleId="conflict-modal-title" overlayClassName="z-[75]">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6">
          <h2 id="conflict-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Delete confirmed
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            You deleted this item locally. We'll remove it from the sync queue; the server state is unchanged.
          </p>
          <Button onClick={() => handleResolve('keep_local')} variant="primary">
            OK
          </Button>
        </div>
      </Modal>
    );
  }

  if (!isOpen) return null;

  if (mergeMode) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} titleId="conflict-merge-title" overlayClassName="z-[75]">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
          <h2 id="conflict-merge-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <GitMerge className="w-5 h-5" />
            Merge manually
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {COMPARE_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                <input
                  type={key === 'quantity' || key === 'price' ? 'number' : 'text'}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2"
                  value={String(mergedForm[key] ?? '')}
                  onChange={(e) =>
                    setMergedForm((prev) => ({
                      ...prev,
                      [key]: key === 'quantity' || key === 'price' ? Number(e.target.value) : e.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleResolve('merge', mergedForm)}
              variant="primary"
            >
              <Save className="w-4 h-4 mr-1" />
              Save merged
            </Button>
            <Button onClick={() => setMergeMode(false)} variant="ghost">
              Back
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} titleId="conflict-modal-title" overlayClassName="z-[75]">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="conflict-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Sync conflict
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {identical && (
          <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2 mb-4">
            Both versions are identical. You can keep either; we'll sync with the server.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Monitor className="w-4 h-4" />
              Local version
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {formatTs(localVersion)}
            </div>
            <dl className="space-y-1 text-sm">
              {COMPARE_FIELDS.map(({ key, label }) => (
                <div key={key} className={diffs[key]?.same ? '' : 'bg-red-200/50 dark:bg-red-800/30 rounded px-1'}>
                  <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="font-mono">{String(diffs[key]?.local ?? '—')}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <Server className="w-4 h-4" />
              Server version
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {serverVersion ? formatTs(serverVersion) : '—'}
            </div>
            <dl className="space-y-1 text-sm">
              {COMPARE_FIELDS.map(({ key, label }) => (
                <div key={key} className={diffs[key]?.same ? '' : 'bg-emerald-200/50 dark:bg-emerald-800/30 rounded px-1'}>
                  <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="font-mono">{String(diffs[key]?.server ?? '—')}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => handleResolve('keep_local')} variant="primary">
            <Monitor className="w-4 h-4 mr-1" />
            Keep local
          </Button>
          <Button onClick={() => handleResolve('keep_server')} variant="secondary">
            <Server className="w-4 h-4 mr-1" />
            Keep server
          </Button>
          <Button onClick={() => setMergeMode(true)} variant="secondary">
            <GitMerge className="w-4 h-4 mr-1" />
            Merge manually
          </Button>
          <Button onClick={() => handleResolve('last_write_wins')} variant="ghost">
            Last write wins
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={useForFuture}
            onChange={(e) => setUseForFuture(e.target.checked)}
            className="rounded border-gray-300"
          />
          Use for future conflicts:
          <select
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm px-2 py-1"
            value={strategyForFuture ?? ''}
            onChange={(e) => setStrategyForFuture((e.target.value || null) as ConflictStrategy | null)}
          >
            <option value="">Ask every time</option>
            <option value="keep_local">Keep local</option>
            <option value="keep_server">Keep server</option>
            <option value="last_write_wins">Last write wins</option>
          </select>
        </label>
      </div>
    </Modal>
  );
}
