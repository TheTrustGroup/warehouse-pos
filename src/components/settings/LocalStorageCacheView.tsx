/**
 * Lets admins check what inventory is stored in localStorage (and export it).
 * Use when the client reports "recorded inventory may not have been saved or sent to local storage".
 */

import { useState, useMemo } from 'react';
import { Database, Download, AlertTriangle, CheckCircle, Trash2 } from 'lucide-react';
import { getStoredData, isStorageAvailable, removeStoredData } from '../../lib/storage';
import { Button } from '../ui/Button';

const PRODUCT_IMAGES_KEY = 'product_images_v1';

const INVENTORY_KEY_PREFIX = 'warehouse_products';
const LEGACY_KEY = 'warehouse_products';

interface CacheEntry {
  key: string;
  label: string;
  count: number;
  sizeBytes: number;
  raw: unknown;
}

function getInventoryCacheEntries(): CacheEntry[] {
  if (typeof localStorage === 'undefined') return [];
  const entries: CacheEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || (key !== LEGACY_KEY && !key.startsWith(INVENTORY_KEY_PREFIX + '_'))) continue;
    try {
      const raw = getStoredData<unknown>(key, []);
      const arr = Array.isArray(raw) ? raw : [];
      const count = arr.length;
      const sizeBytes = new Blob([JSON.stringify(raw)]).size;
      const label = key === LEGACY_KEY ? 'Legacy (all warehouses fallback)' : `Warehouse ${key.replace(INVENTORY_KEY_PREFIX + '_', '')}`;
      entries.push({ key, label, count, sizeBytes, raw });
    } catch {
      entries.push({ key, label: key, count: 0, sizeBytes: 0, raw: [] });
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function LocalStorageCacheView() {
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now());
  const [clearing, setClearing] = useState<'list' | 'images' | null>(null);

  const { available, entries, totalProducts, hasProductImages } = useMemo(() => {
    const available = isStorageAvailable();
    const entries = getInventoryCacheEntries();
    const totalProducts = entries.reduce((sum, e) => sum + e.count, 0);
    const hasProductImages =
      available &&
      typeof localStorage !== 'undefined' &&
      localStorage.getItem(PRODUCT_IMAGES_KEY) != null;
    return { available, entries, totalProducts, hasProductImages };
  }, [lastRefreshed]);

  const handleClearProductListCache = () => {
    if (
      !confirm(
        'Clear product list cache (warehouse_products)? The app will refetch from the server when you open Inventory or tap "Refresh list". Continue?'
      )
    )
      return;
    setClearing('list');
    try {
      entries.forEach((e) => removeStoredData(e.key));
      if (typeof localStorage !== 'undefined') {
        if (!entries.some((e) => e.key === LEGACY_KEY)) removeStoredData(LEGACY_KEY);
      }
      setLastRefreshed(Date.now());
    } finally {
      setClearing(null);
    }
  };

  const handleClearProductImagesCache = () => {
    if (
      !confirm(
        'Clear product images cache? Images will be refetched or re-uploaded when you edit products. Continue?'
      )
    )
      return;
    setClearing('images');
    try {
      removeStoredData(PRODUCT_IMAGES_KEY);
      setLastRefreshed(Date.now());
    } finally {
      setClearing(null);
    }
  };

  const handleExport = (entry: CacheEntry) => {
    const blob = new Blob([JSON.stringify(entry.raw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-cache-${entry.key}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAll = () => {
    const all: Record<string, unknown> = {};
    entries.forEach((e) => {
      all[e.key] = e.raw;
    });
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-cache-all-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Local storage (inventory cache)</h2>
        <p className="text-slate-600 text-sm mt-1">
          Check what recorded inventory is stored on this device. If items appear here but not on the server, use <strong>Inventory → Sync to server</strong>.
        </p>
      </div>

      {!available ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">Local storage is not available</p>
            <p className="text-sm text-amber-800 mt-1">
              This can happen in private browsing or when storage is disabled. Recorded inventory may not be saved on this device. Use a normal browser window and ensure storage is enabled.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLastRefreshed(Date.now())}
              className="inline-flex items-center gap-2"
            >
              <Database className="w-4 h-4" />
              Refresh
            </Button>
            {entries.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleExportAll}
                className="inline-flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export all cache as JSON
              </Button>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center">
              <Database className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-slate-600 font-medium">No inventory cache in local storage</p>
              <p className="text-slate-500 text-sm mt-1">
                Cache is created when you load or add products. If you just recorded items, open Inventory and use &quot;Sync to server&quot; if you see unsynced items.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                <CheckCircle className="w-4 h-4 inline-block mr-1 text-green-600 align-middle" />
                <strong>{totalProducts}</strong> product{totalProducts !== 1 ? 's' : ''} across <strong>{entries.length}</strong> cache key{entries.length !== 1 ? 's' : ''}.
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden table-scroll-wrap">
                <table className="w-full text-sm min-w-[320px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium text-slate-600">Key / Label</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Products</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600">Size</th>
                      <th className="text-right py-3 px-4 font-medium text-slate-600 w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.key} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 px-4">
                          <span className="font-mono text-slate-800">{entry.key}</span>
                          {entry.label !== entry.key && (
                            <p className="text-xs text-slate-500 mt-0.5">{entry.label}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">{entry.count}</td>
                        <td className="py-3 px-4 text-right text-slate-600">{formatBytes(entry.sizeBytes)}</td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleExport(entry)}
                            className="text-primary-600 hover:text-primary-700 font-medium text-sm min-h-0 py-0"
                          >
                            Export
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500">
                These keys are used to show inventory when the server is slow or offline. They are updated when you load or change products. To push local-only items to the server, go to Inventory and click &quot;Sync to server&quot; if the banner appears.
              </p>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800 mb-2">Clean cache for real data</h3>
            <p className="text-sm text-slate-600 mb-3">
              Use these when preparing for real data so old demo or dev cache does not linger. After clearing, open Inventory and use &quot;Refresh list&quot; to load from the server.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClearProductListCache}
                disabled={clearing !== null || entries.length === 0}
                className="inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {clearing === 'list' ? 'Clearing…' : 'Clear product list cache'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClearProductImagesCache}
                disabled={clearing !== null || !hasProductImages}
                className="inline-flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                {clearing === 'images' ? 'Clearing…' : 'Clear product images cache'}
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Offline mode: clear local products and sync queue from <strong>Admin dashboard</strong> (Clear local product data).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
