/**
 * Floating debug panel when ?debug=true. Real-time logs, network inspector, IDB summary, manual triggers.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Database,
  Trash2,
  Copy,
  Bug,
} from 'lucide-react';
import { subscribeToLogs, getRecentLogBuffer, clearLogs } from '../../utils/logger';
import { syncService } from '../../services/syncService';
import { db } from '../../db/inventoryDB';

const PANEL_WIDTH = 420;
const LOG_HEIGHT = 220;

export function DebugPanel() {
  const [searchParams] = useSearchParams();
  const debug = searchParams.get('debug') === 'true';
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<'logs' | 'network' | 'idb'>('logs');
  const [logs, setLogs] = useState<Array<{ level: string; category: string; message: string; data?: unknown; timestamp: number }>>([]);
  const [networkEntries, setNetworkEntries] = useState<Array<{ name: string; duration?: number; type?: string }>>([]);
  const [idbSummary, setIdbSummary] = useState<{ products: number; syncQueue: number; logs: number } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!debug) return;
    setLogs(getRecentLogBuffer());
    const unsub = subscribeToLogs((entry) => {
      setLogs((prev) => [...prev.slice(-199), entry]);
    });
    return unsub;
  }, [debug]);

  useEffect(() => {
    if (!debug || tab !== 'logs') return;
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [debug, tab, logs]);

  const refreshNetwork = useCallback(() => {
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const entries = performance.getEntriesByType('resource').slice(-50).reverse();
      setNetworkEntries(
        entries.map((e) => ({
          name: e.name,
          duration: e.duration,
          type: e.initiatorType,
        }))
      );
    }
  }, []);

  const refreshIdb = useCallback(async () => {
    try {
      const [products, syncQueue, logsCount] = await Promise.all([
        db.products.count(),
        db.syncQueue.count(),
        (await import('../../utils/logger')).logDb.logs.count(),
      ]);
      setIdbSummary({ products, syncQueue, logs: logsCount });
    } catch {
      setIdbSummary(null);
    }
  }, []);

  useEffect(() => {
    if (!debug) return;
    if (tab === 'network') refreshNetwork();
    if (tab === 'idb') refreshIdb();
  }, [debug, tab, refreshNetwork, refreshIdb]);

  const handleSync = () => {
    syncService.processSyncQueue().catch(() => {});
  };

  const handleClearLogs = async () => {
    await clearLogs();
    setLogs([]);
  };

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.level}] [${l.category}] ${l.message}${l.data != null ? ` ${JSON.stringify(l.data)}` : ''}`
      )
      .join('\n');
    navigator.clipboard?.writeText(text);
  };

  if (!debug) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col rounded-xl border border-slate-300 bg-slate-900 text-slate-100 shadow-2xl"
      style={{ width: PANEL_WIDTH, maxHeight: '80vh' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-slate-700 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 font-semibold text-sm">
          <Bug className="w-4 h-4 text-amber-400" />
          Debug
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="p-1 rounded hover:bg-slate-700"
            aria-label="Minimize"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <a
            href={(() => {
              const params = new URLSearchParams(window.location.search);
              params.delete('debug');
              const q = params.toString();
              return window.location.pathname + (q ? `?${q}` : '');
            })()}
            className="p-1 rounded hover:bg-slate-700"
            aria-label="Close debug"
          >
            <X className="w-4 h-4" />
          </a>
        </div>
      </div>

      {open && (
        <>
          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            {(['logs', 'network', 'idb'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 px-2 py-2 text-xs font-medium capitalize ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t === 'idb' ? 'IndexedDB' : t}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden min-h-0" style={{ height: LOG_HEIGHT }}>
            {tab === 'logs' && (
              <div className="h-full flex flex-col">
                <div className="flex justify-end gap-1 p-1 border-b border-slate-700">
                  <button
                    type="button"
                    onClick={copyLogs}
                    className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                  >
                    <Copy className="w-3 h-3 inline mr-1" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={handleClearLogs}
                    className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600"
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    Clear
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-2 text-xs font-mono whitespace-pre-wrap break-all">
                  {logs.length === 0 ? 'No logs (streaming when ?debug=true).' : null}
                  {logs.map((l, i) => (
                    <div key={i} className="text-slate-300 border-b border-slate-800/50 py-0.5">
                      <span className={l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARN' ? 'text-amber-400' : ''}>
                        [{new Date(l.timestamp).toISOString().slice(11, 23)}] [{l.level}] {l.message}
                        {l.data != null ? ` ${JSON.stringify(l.data)}` : ''}
                      </span>
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </pre>
              </div>
            )}

            {tab === 'network' && (
              <div className="h-full overflow-auto p-2">
                <button
                  type="button"
                  onClick={refreshNetwork}
                  className="mb-2 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
                <ul className="text-xs font-mono space-y-1">
                  {networkEntries.length === 0 ? 'No entries. Click Refresh.' : null}
                  {networkEntries.map((e, i) => (
                    <li key={i} className="truncate text-slate-400" title={e.name}>
                      {e.type} {e.duration != null ? `${Math.round(e.duration)}ms` : ''} — {e.name.slice(0, 60)}…
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === 'idb' && (
              <div className="h-full overflow-auto p-2">
                <button
                  type="button"
                  onClick={refreshIdb}
                  className="mb-2 text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
                {idbSummary != null ? (
                  <ul className="text-xs text-slate-300 space-y-1">
                    <li>products: {idbSummary.products}</li>
                    <li>syncQueue: {idbSummary.syncQueue}</li>
                    <li>logs: {idbSummary.logs}</li>
                  </ul>
                ) : (
                  <p className="text-slate-500">Click Refresh.</p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 p-2 border-t border-slate-700">
            <button
              type="button"
              onClick={handleSync}
              className="text-xs px-2 py-1.5 rounded bg-primary-600 hover:bg-primary-700 text-white flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Sync now
            </button>
            <button
              type="button"
              onClick={() => (tab === 'network' ? refreshNetwork() : refreshIdb())}
              className="text-xs px-2 py-1.5 rounded bg-slate-700 hover:bg-slate-600 flex items-center gap-1"
            >
              <Database className="w-3 h-3" />
              Refresh {tab}
            </button>
          </div>
        </>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="p-2 flex items-center justify-center text-slate-400 hover:text-white"
          aria-label="Expand debug panel"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
