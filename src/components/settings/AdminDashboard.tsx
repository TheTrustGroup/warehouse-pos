/**
 * Admin Dashboard: sync statistics, failed sync items, logs, export sync queue, manual sync, clear cache.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  RefreshCw,
  Download,
  Trash2,
  AlertTriangle,
  FileJson,
  Database,
  Loader2,
  Archive,
  Upload,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { syncService } from '../../services/syncService';
import {
  getFailedQueueItems,
  getAllSyncQueueItems,
  clearFailedQueueItems,
  clearAllLocalProductData,
  exportAllData,
  importFromBackup,
} from '../../db/inventoryDB';
import { getTelemetrySnapshot, resetTelemetry } from '../../lib/telemetry';
import {
  getLogs,
  exportLogs,
  clearLogs,
} from '../../utils/logger';
import { getErrorReportingConsent, setErrorReportingConsent } from '../../lib/initErrorHandlers';
import { clearOfflineQuotaExceeded } from '../../lib/offlineQuota';

type QueueItem = {
  id: number;
  operation: string;
  tableName: string;
  data?: { id?: string; name?: string };
  timestamp: number;
  attempts?: number;
  error?: string;
  status: string;
};

type LogEntry = {
  id?: number;
  level: string;
  category: string;
  message: string;
  data?: unknown;
  timestamp: number;
};

export function AdminDashboard() {
  const [queueStatus, setQueueStatus] = useState<{
    pending: number;
    syncing: number;
    failed: number;
  } | null>(null);
  const [telemetry, setTelemetry] = useState<{
    syncSuccessCount: number;
    syncFailCount: number;
    syncSuccessRate: number | null;
    averageSyncTimeMs: number | null;
    offlineDurationMs: number;
    conflictCount: number;
  } | null>(null);
  const [failedItems, setFailedItems] = useState<QueueItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorConsent, setErrorConsent] = useState(getErrorReportingConsent());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [status, snap, failed, logList] = await Promise.all([
        syncService.getQueueStatus(),
        getTelemetrySnapshot(),
        getFailedQueueItems(),
        getLogs(100),
      ]);
      setQueueStatus(status);
      setTelemetry(snap);
      setFailedItems(failed as QueueItem[]);
      setLogs(logList as LogEntry[]);
    } catch (e) {
      console.error('AdminDashboard load:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const emitter = syncService.getEmitter();
    const onDone = () => {
      setSyncing(false);
      load();
    };
    emitter.addEventListener('sync-completed', onDone as EventListener);
    emitter.addEventListener('sync-failed', onDone as EventListener);
    return () => {
      emitter.removeEventListener('sync-completed', onDone as EventListener);
      emitter.removeEventListener('sync-failed', onDone as EventListener);
    };
  }, [load]);

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await syncService.processSyncQueue();
    } finally {
      setSyncing(false);
      await load();
    }
  };

  const handleExportQueue = async () => {
    try {
      const items = await getAllSyncQueueItems();
      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), items }, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync-queue-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export queue:', e);
    }
  };

  const handleExportLogs = async () => {
    try {
      const json = await exportLogs(1000);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `logs-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export logs:', e);
    }
  };

  const handleClearFailed = async () => {
    if (!confirm('Remove all failed sync items from the queue? They will not be retried.')) return;
    try {
      await clearFailedQueueItems();
      await load();
    } catch (e) {
      console.error('Clear failed:', e);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Delete all stored logs? This cannot be undone.')) return;
    try {
      await clearLogs();
      await load();
    } catch (e) {
      console.error('Clear logs:', e);
    }
  };

  const handleResetTelemetry = async () => {
    if (!confirm('Reset sync/offline/conflict metrics to zero?')) return;
    try {
      await resetTelemetry();
      await load();
    } catch (e) {
      console.error('Reset telemetry:', e);
    }
  };

  const handleClearAllLocalProductData = async () => {
    if (
      !confirm(
        'Clear all local product data and sync queue? Server data is unchanged. You will need to reload from server. Continue?'
      )
    )
      return;
    try {
      await clearAllLocalProductData();
      clearOfflineQuotaExceeded();
      await load();
      alert('Local products and sync queue cleared. Reload the app or refresh the inventory list to load from server.');
    } catch (e) {
      console.error('Clear all local product data:', e);
      alert('Failed to clear local data.');
    }
  };

  const handleExportBackup = async () => {
    try {
      const data = await exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `warehouse-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export backup:', e);
    }
  };

  const handleRestoreBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const replace = confirm(
      'Replace current data with backup? (Yes = clear then restore; No = merge backup into current data)'
    );
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const backup = JSON.parse(reader.result as string);
        const result = await importFromBackup(backup, { replace });
        alert(`Restored: ${result.productsAdded} products, ${result.queueAdded} queue items.`);
        await load();
      } catch (err) {
        console.error('Restore backup:', err);
        alert('Invalid backup file or restore failed.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  if (loading && !queueStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sync statistics */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Sync statistics
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="solid-card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Success rate</p>
            <p className="text-xl font-semibold text-slate-900">
              {telemetry?.syncSuccessRate != null
                ? `${(telemetry.syncSuccessRate * 100).toFixed(0)}%`
                : '—'}
            </p>
          </div>
          <div className="solid-card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Avg sync time</p>
            <p className="text-xl font-semibold text-slate-900">
              {telemetry?.averageSyncTimeMs != null
                ? `${Math.round(telemetry.averageSyncTimeMs)} ms`
                : '—'}
            </p>
          </div>
          <div className="solid-card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Offline duration</p>
            <p className="text-xl font-semibold text-slate-900">
              {telemetry?.offlineDurationMs
                ? `${(telemetry.offlineDurationMs / 1000).toFixed(1)} s total`
                : '—'}
            </p>
          </div>
          <div className="solid-card p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Conflicts</p>
            <p className="text-xl font-semibold text-slate-900">
              {telemetry?.conflictCount ?? 0}
            </p>
          </div>
        </div>
      </section>

      {/* Queue status + Manual sync */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Sync queue</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex gap-4 text-sm">
            <span className="text-slate-600">
              Pending: <strong>{queueStatus?.pending ?? 0}</strong>
            </span>
            <span className="text-slate-600">
              Syncing: <strong>{queueStatus?.syncing ?? 0}</strong>
            </span>
            <span className="text-slate-600">
              Failed: <strong>{queueStatus?.failed ?? 0}</strong>
            </span>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleManualSync}
            disabled={syncing}
            className="flex items-center gap-2"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportQueue}
            className="flex items-center gap-2"
          >
            <FileJson className="w-4 h-4" />
            Export queue JSON
          </Button>
        </div>
      </section>

      {/* Failed sync items */}
      {failedItems.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Failed sync items
          </h2>
          <div className="solid-card overflow-hidden">
            <ul className="divide-y divide-slate-200 max-h-48 overflow-y-auto">
              {failedItems.map((item) => (
                <li key={item.id} className="px-4 py-2 text-sm flex justify-between items-center">
                  <span>
                    {item.operation} {item.tableName}
                    {item.data?.name != null ? `: ${item.data.name}` : ''}
                    {item.data?.id != null ? ` (${item.data.id})` : ''}
                  </span>
                  <span className="text-red-600 text-xs max-w-[200px] truncate" title={item.error}>
                    {item.error}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50">
              <Button variant="secondary" size="sm" onClick={handleClearFailed}>
                <Trash2 className="w-4 h-4 mr-1" />
                Clear failed items
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Logs */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Database className="w-5 h-5" />
          Logs (last 100)
        </h2>
        <div className="solid-card overflow-hidden">
          <div className="flex justify-end gap-2 p-2 border-b border-slate-200">
            <Button variant="secondary" size="sm" onClick={handleExportLogs}>
              <Download className="w-4 h-4 mr-1" />
              Export logs
            </Button>
            <Button variant="secondary" size="sm" onClick={handleClearLogs}>
              Clear logs
            </Button>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-900 text-slate-100 max-h-64 overflow-auto">
            {logs.length === 0
              ? 'No logs.'
              : logs
                  .map(
                    (l) =>
                      `[${new Date(l.timestamp).toISOString()}] [${l.level}] [${l.category}] ${l.message}${l.data != null ? ` ${JSON.stringify(l.data)}` : ''}`
                  )
                  .join('\n')}
          </pre>
        </div>
      </section>

      {/* Clear local data (INTEGRATION_PLAN) */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Local data
        </h2>
        <p className="text-sm text-slate-600 mb-2">
          Clear all locally stored products and the sync queue. Server data is unchanged. Use if storage is full or to force a fresh load.
        </p>
        <Button variant="secondary" size="sm" onClick={handleClearAllLocalProductData} className="flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          Clear all local product data
        </Button>
      </section>

      {/* Backup / Restore */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Archive className="w-5 h-5" />
          Backup &amp; restore
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Export all local products and sync queue for backup. Restore on this device or another (merge or replace).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportBackup} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export backup (JSON)
          </Button>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-100">
            <Upload className="w-4 h-4" />
            Restore from file
            <input type="file" accept=".json,application/json" className="hidden" onChange={handleRestoreBackup} />
          </label>
        </div>
      </section>

      {/* Error reporting consent & Maintenance */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Error reporting & maintenance</h2>
        <div className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={errorConsent}
              onChange={(e) => {
                const v = e.target.checked;
                setErrorConsent(v);
                setErrorReportingConsent(v);
              }}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">
              Send error reports to server when configured (e.g. Sentry). No user data is included.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={handleResetTelemetry}>
              Reset telemetry
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
