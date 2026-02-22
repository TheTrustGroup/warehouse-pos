// ============================================================
// DashboardPage.tsx
// File: warehouse-pos/src/pages/DashboardPage.tsx
//
// THE FIX: This replaces whatever Dashboard component was using
// "apiClient.ts:138" with a hardcoded Main Store warehouse_id.
//
// ROOT CAUSE OF THE BUG (confirmed from network tab):
//   Old dashboard: warehouse_id = hardcoded or stale ...0001 (Main Store)
//   UI label showed "Main Town" but data was still Main Store.
//
// HOW THIS FILE FIXES IT:
//   Reads warehouseId from WarehouseContext.
//   Every time warehouse changes → useEffect re-runs → fetches correct data.
//   Stats are computed from the fetched products (accurate, real numbers).
//   Today's sales are fetched from /api/sales filtered by warehouse + date.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import { DollarSign, Package, AlertTriangle, Receipt, ShoppingCart, CheckCircle } from 'lucide-react';
import { useWarehouse } from '../contexts/WarehouseContext';
import { getApiHeaders, API_BASE_URL } from '../lib/api';

// ── Types (match GET /api/dashboard response) ──────────────────────────────

interface DashboardLowStockItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  quantityBySize: { sizeCode: string; quantity: number }[];
  reorderLevel: number;
}

interface DashboardCategorySummary {
  [category: string]: { count: number; value: number };
}

interface DashboardData {
  totalStockValue: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  todaySales: number;
  lowStockItems: DashboardLowStockItem[];
  categorySummary: DashboardCategorySummary;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatGHC(n: number): string {
  return 'GH₵' + n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Rounded/compact so large amounts fit in the stat card (e.g. GH₵585.5K, GH₵1.2M). */
function formatGHCCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}GH₵${v >= 10 ? Math.round(v) : v.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const v = abs / 1_000;
    return `${sign}GH₵${v >= 100 ? Math.round(v) : v.toFixed(1)}K`;
  }
  return sign + 'GH₵' + abs.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// ── apiFetch (with retry for transient network failures) ───────────────────

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 2_000];

function isRetryableError(e: unknown): boolean {
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (e.name === 'AbortError' || msg.includes('timeout')) return true;
    if (msg.includes('network') || msg.includes('connection') || msg.includes('failed to fetch')) return true;
  }
  return false;
}

async function apiFetchOnce<T = unknown>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: getApiHeaders() as HeadersInit,
      signal:  ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      throw new Error((b as { error?: string; message?: string }).error ?? (b as { error?: string; message?: string }).message ?? `HTTP ${res.status}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e: unknown) {
    clearTimeout(t);
    if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timed out');
    throw e;
  }
}

async function apiFetch<T = unknown>(path: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      return await apiFetchOnce<T>(path);
    } catch (e) {
      lastErr = e;
      if (i < RETRY_DELAYS_MS.length && isRetryableError(e)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
  warning = false,
  danger = false,
}: {
  label:   string;
  value:   string | number;
  icon:    LucideIcon;
  accent?: boolean;
  warning?: boolean;
  danger?:  boolean;
}) {
  const bg = accent  ? 'bg-white border-slate-200' :
             warning ? 'bg-white border-slate-200' :
             danger  ? 'bg-white border-slate-200' :
                       'bg-white border-slate-200';

  const valColor = danger  ? 'text-red-500'   :
                   warning ? 'text-amber-500' :
                             'text-slate-900';

  const iconColor = danger  ? 'text-red-500'   :
                    warning ? 'text-amber-500' :
                              'text-slate-400';

  return (
    <div className={`flex flex-col justify-between p-6 rounded-2xl border ${bg} shadow-sm`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[13px] font-semibold text-slate-500">{label}</span>
        <Icon className={iconColor} size={28} aria-hidden />
      </div>
      <p className={`text-[28px] font-black tabular-nums leading-none min-w-0 truncate ${valColor}`} title={typeof value === 'string' ? value : String(value)}>{value}</p>
    </div>
  );
}

// ── Low stock table (uses pre-aggregated lowStockItems from API) ────────────

function LowStockTable({ items }: { items: DashboardLowStockItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 py-6 px-4 text-emerald-600">
        <CheckCircle className="w-6 h-6 flex-shrink-0" aria-hidden />
        <span className="text-[14px] font-semibold">All products are sufficiently stocked</span>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {items.map((p) => {
        const isOut = p.quantity === 0;
        return (
          <div key={p.id} className="flex items-center justify-between py-3.5 px-4">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-slate-900 truncate">{p.name}</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">{p.category || 'Uncategorised'}</p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-bold
                ${isOut
                  ? 'bg-red-50 text-red-500 border border-red-100'
                  : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isOut ? 'bg-red-400' : 'bg-amber-400'}`}/>
                {isOut ? 'Out of stock' : `${p.quantity} left`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function DashboardPage() {
  // THIS IS THE KEY FIX:
  // Uses WarehouseContext — same warehouse state as Sidebar, Inventory, POS.
  // When sidebar changes warehouse → warehouseId updates → useEffect re-fetches.
  const { currentWarehouseId, currentWarehouse } = useWarehouse();
  const warehouseId   = currentWarehouseId;
  const warehouseName = currentWarehouse?.name ?? 'Warehouse';

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (wid: string) => {
    setLoading(true);
    setError(null);
    setDashboard(null);

    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await apiFetch<DashboardData>(
        `/api/dashboard?warehouse_id=${encodeURIComponent(wid)}&date=${today}`
      );
      setDashboard(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(warehouseId);
  }, [warehouseId, loadData]);

  const stats = dashboard
    ? {
        totalStockValue: dashboard.totalStockValue,
        totalProducts: dashboard.totalProducts,
        lowStockCount: dashboard.lowStockCount,
        outOfStockCount: dashboard.outOfStockCount,
        todaysSales: dashboard.todaySales,
      }
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-[24px] font-black text-slate-900 tracking-tight">
                Admin Control Panel
              </h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                               bg-slate-900 text-white text-[11px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
                Super Admin
              </span>
            </div>
            <p className="text-[13px] text-slate-500">
              Full system access — inventory, POS, reports, users &amp; settings.
            </p>
          </div>

          <a href="/pos"
             className="flex items-center gap-2 h-10 px-5 rounded-xl bg-red-500 hover:bg-red-600
                        text-white text-[14px] font-bold transition-colors
                        shadow-[0_4px_12px_rgba(239,68,68,0.3)]">
            <ShoppingCart className="w-5 h-5" aria-hidden />
            New sale
          </a>
        </div>

        {/* ── Warehouse label — proves context is working ── */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"/>
          <p className="text-[13px] font-semibold text-slate-600">
            Inventory stats for:{' '}
            <span className="text-slate-900 font-black">{warehouseName}</span>
          </p>
          {loading && (
            <span className="text-[12px] text-slate-400 animate-pulse">Loading…</span>
          )}
        </div>

        {/* ── Error ── */}
        {error && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
            <AlertTriangle className="w-6 h-6 flex-shrink-0 text-red-500" aria-hidden />
            <div>
              <p className="text-[14px] font-bold text-red-700">Failed to load data</p>
              <p className="text-[12px] text-red-500 mt-0.5">{error}</p>
            </div>
            <button onClick={() => loadData(warehouseId)}
                    className="ml-auto px-4 py-2 rounded-xl bg-red-500 text-white text-[12px] font-bold hover:bg-red-600">
              Retry
            </button>
          </div>
        )}

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Stock Value"
            value={loading || !stats ? '—' : formatGHCCompact(stats.totalStockValue)}
            icon={DollarSign}
            accent
          />
          <StatCard
            label="Total Products"
            value={loading || !stats ? '—' : stats.totalProducts}
            icon={Package}
          />
          <StatCard
            label="Low Stock Items"
            value={loading || !stats ? '—' : stats.lowStockCount + stats.outOfStockCount}
            icon={AlertTriangle}
            warning={stats ? stats.lowStockCount + stats.outOfStockCount > 0 : false}
          />
          <StatCard
            label="Today's Sales"
            value={loading || !stats ? '—' : formatGHCCompact(stats.todaysSales)}
            icon={Receipt}
          />
        </div>

        {/* ── Low stock alerts ── */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-[15px] font-black text-slate-900">Stock Alerts</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">
                {warehouseName} — products at or below reorder level
              </p>
            </div>
            {stats && stats.outOfStockCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-red-50 text-red-500 text-[12px] font-bold border border-red-100">
                {stats.outOfStockCount} out of stock
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => (
                <div key={i} className="h-10 bg-slate-100 rounded-xl animate-pulse"/>
              ))}
            </div>
          ) : (
            <LowStockTable items={dashboard?.lowStockItems ?? []}/>
          )}
        </div>

        {/* ── Category breakdown ── */}
        {!loading && dashboard && Object.keys(dashboard.categorySummary).length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-[15px] font-black text-slate-900">By Category</h2>
              <p className="text-[12px] text-slate-400 mt-0.5">{warehouseName}</p>
            </div>
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(dashboard.categorySummary)
                .sort((a, b) => b[1].value - a[1].value)
                .map(([cat, { count, value }]) => (
                  <div key={cat}
                       className="flex flex-col gap-1 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">{cat}</span>
                    <span className="text-[18px] font-black text-slate-900">{count} SKUs</span>
                    <span className="text-[11px] text-slate-400 font-medium">{formatGHC(value)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
