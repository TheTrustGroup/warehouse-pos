// ============================================================
// DashboardPage.tsx — Phase 5: design system (StatCard, Badge, Button, --edk-*)
// Uses WarehouseContext for warehouseId. Data via React Query (useDashboardQuery).
// ============================================================

import { useEffect, useState } from 'react';
import { DollarSign, Package, AlertTriangle, Receipt, ShoppingCart, CheckCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import { usePresence } from '../contexts/PresenceContext';
import { isValidWarehouseId } from '../lib/warehouseId';
import { useDashboardQuery, type DashboardLowStockItem } from '../hooks/useDashboardQuery';
import { StatCard } from '../components/ui/StatCard';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatGHC(n: number): string {
  return 'GH₵' + n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MOBILE_BREAKPOINT = 768;
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const handler = () => setMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

/** Mobile-only stat card per spec: rounded-xl, 10px label, 26px value, blue/red/default. */
function DashboardStatCardMobile({
  label,
  value,
  variant = 'default',
  valueColor,
  loading,
}: {
  label: string;
  value: string | number;
  variant?: 'blue' | 'default';
  valueColor?: 'red' | 'blue';
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border-[0.5px] border-[#E0DED8] bg-white p-3 animate-pulse">
        <div className="h-3 w-16 bg-[#E0DED8] rounded mb-1.5" />
        <div className="h-7 w-20 bg-[#E0DED8] rounded" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-xl border-[0.5px] p-3 ${
        variant === 'blue'
          ? 'bg-[#1B6FE8] border-[#1B6FE8]'
          : 'bg-white border-[#E0DED8]'
      }`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5 ${
          variant === 'blue' ? 'text-white/70' : 'text-[#9B9890]'
        }`}
      >
        {label}
      </p>
      <p
        className={`font-display text-[26px] leading-none ${
          variant === 'blue'
            ? 'text-white'
            : valueColor === 'blue'
              ? 'text-[#1B6FE8]'
              : valueColor === 'red'
                ? 'text-[#E83B2E]'
                : 'text-[#1A1916]'
        }`}
        style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif" }}
      >
        {value}
      </p>
    </div>
  );
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

// ── Low stock table (uses pre-aggregated lowStockItems from API) ────────────

function LowStockTable({ items }: { items: DashboardLowStockItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 px-3 text-[var(--edk-green)]">
        <CheckCircle className="w-5 h-5 flex-shrink-0" strokeWidth={2} aria-hidden />
        <span className="text-[13px] font-semibold">All products are sufficiently stocked</span>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--edk-border)]">
      {items.map((p) => {
        const isOut = p.quantity === 0;
        return (
          <div key={p.id} className="flex items-center justify-between py-2.5 px-3">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-[var(--edk-ink)] truncate">{p.name}</p>
              <p className="text-[10px] text-[var(--edk-ink-3)] font-medium mt-0.5">{p.category || 'Uncategorised'}</p>
            </div>
            <div className="flex items-center gap-3 ml-4">
              <Badge variant={isOut ? 'danger' : 'warning'} size="md">
                {isOut ? 'Out of stock' : `${p.quantity} left`}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { currentWarehouseId, currentWarehouse, warehouses } = useWarehouse();
  const { hasRole, user } = useAuth();
  const { presenceList, isSubscribed } = usePresence();
  const warehouseId = currentWarehouseId ?? '';
  const warehouseName = currentWarehouse?.name ?? 'Warehouse';
  const isWarehouseValid = isValidWarehouseId(warehouseId);
  const canSeePresence = hasRole(['admin', 'super_admin']);
  const roleLabel = user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : null;

  const { dashboard, todayByWarehouse, isLoading: loading, error: queryError, refetch } = useDashboardQuery(warehouseId);
  const error = queryError?.message ?? null;

  useEffect(() => {
    if (isWarehouseValid) refetch();
  }, [isWarehouseValid, refetch]);

  const stats = dashboard
    ? {
        totalStockValue: dashboard.totalStockValue,
        totalProducts: dashboard.totalProducts,
        lowStockCount: dashboard.lowStockCount,
        outOfStockCount: dashboard.outOfStockCount,
        todaysSales: dashboard.todaySales,
      }
    : null;

  const statLoading = !isWarehouseValid || (loading && !dashboard);
  const firstTwoWarehouses = warehouses.slice(0, 2);

  return (
    <div className="min-h-screen bg-[var(--edk-bg)] p-3 sm:p-4">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* ── Header: mobile = DASHBOARD + subtitle + New sale in header; desktop = original ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h1
              className="text-[26px] tracking-[0.04em] text-[#1A1916]"
              style={{ fontFamily: "'Bebas Neue', 'Barlow Condensed', sans-serif" }}
            >
              {isMobile ? 'DASHBOARD' : 'Dashboard'}
            </h1>
            <p className="text-[12px] text-[#9B9890] mt-0.5">
              {isMobile ? `${warehouseName} · ${roleLabel ?? 'User'}` : 'Inventory stats, stock alerts, and today\'s sales for this warehouse.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/pos')}
            className="bg-[#1A1916] text-white text-[13px] font-semibold px-3 py-2 rounded-lg flex items-center gap-1 whitespace-nowrap mt-1"
          >
            <ShoppingCart size={13} strokeWidth={2} />
            New sale
          </button>
        </div>

        {!isMobile && (
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--edk-green)]" aria-hidden />
            <p className="text-[12px] font-semibold text-[var(--edk-ink-2)]">
              {!isWarehouseValid ? (
                <>Loading warehouse…</>
              ) : (
                <>Inventory stats for: <span className="text-[var(--edk-ink)] font-bold">{warehouseName}</span></>
              )}
            </p>
            {isWarehouseValid && loading && (
              <span className="flex items-center gap-2 text-[12px] text-[var(--edk-ink-3)]">
                <LoadingSpinner size="sm" />
                Loading…
              </span>
            )}
          </div>
        )}

        {/* ── Today's Sales by Location: mobile = compact card; desktop = full grid ── */}
        {warehouses.length > 0 && (
          isMobile && firstTwoWarehouses.length > 0 ? (
            <div className="bg-white rounded-2xl border-[0.5px] border-[#E0DED8] p-3 mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9B9890] mb-2">
                Today&apos;s Sales by Location
              </p>
              <div className="flex gap-6">
                {firstTwoWarehouses.map((w) => {
                  const amount = todayByWarehouse[w.id] ?? 0;
                  const hasSales = !loading && amount > 0;
                  return (
                    <div key={w.id}>
                      <p className="text-[11px] text-[#9B9890]">{w.name}</p>
                      <p className={`text-[15px] font-semibold ${hasSales ? 'text-[#1B6FE8]' : 'text-[#9B9890]'}`}>
                        {loading ? '—' : formatGHCCompact(amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--edk-border)]">
              <h2 className="text-[14px] font-bold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Today&apos;s Sales by Location
              </h2>
              <p className="text-[11px] text-[var(--edk-ink-3)] mt-0.5">Sales total per warehouse for today</p>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {warehouses.map((w) => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-[var(--edk-radius-sm)] bg-[var(--edk-surface-2)] border border-[var(--edk-border-mid)]">
                  <span className="text-[12px] font-bold text-[var(--edk-ink-2)]">{w.name}</span>
                  <span className="text-[14px] font-semibold tabular-nums text-[var(--edk-ink)] font-mono" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {loading ? '—' : formatGHCCompact(todayByWarehouse[w.id] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          )
        )}

        {/* ── Active cashiers (admin only, Supabase Realtime Presence) ── */}
        {canSeePresence && (
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--edk-border)] flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--edk-ink-3)]" strokeWidth={2} aria-hidden />
              <div>
                <h2 className="text-[14px] font-bold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {presenceList.length === 0 ? 'No other users active' : `${presenceList.length} cashier${presenceList.length !== 1 ? 's' : ''} active`}
                </h2>
                <p className="text-[11px] text-[var(--edk-ink-3)] mt-0.5">
                  {isSubscribed ? 'Live — updates when someone opens or leaves the app' : 'Connecting…'}
                </p>
              </div>
            </div>
            {presenceList.length > 0 && (
              <ul className="p-4 space-y-1.5">
                {presenceList.map((entry) => (
                  <li key={entry.key} className="flex items-center justify-between gap-2 p-2.5 rounded-[var(--edk-radius-sm)] bg-[var(--edk-surface-2)] border border-[var(--edk-border-mid)]">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-[var(--edk-ink)] truncate">{entry.payload.displayName || entry.payload.email}</p>
                      <p className="text-[11px] text-[var(--edk-ink-2)]">
                        {entry.payload.page} — {entry.payload.warehouseName}
                        {entry.isIdle && <span className="ml-2 text-[var(--edk-amber)] font-medium">Idle</span>}
                      </p>
                    </div>
                    {!entry.isIdle && <span className="text-[11px] text-[var(--edk-ink-3)] whitespace-nowrap">{entry.lastActivityAgo}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Soft notice when API returned 200 with empty stats ── */}
        {dashboard?.error && !loading && (
          <div className="flex items-center gap-2 p-3 rounded-[var(--edk-radius)] bg-[var(--edk-amber-bg)] border border-[var(--edk-amber)]/20">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--edk-amber)]" strokeWidth={2} aria-hidden />
            <div>
              <p className="text-[13px] font-bold text-[var(--edk-ink)]">Stats temporarily unavailable</p>
              <p className="text-[11px] text-[var(--edk-ink-2)] mt-0.5">{dashboard.error}</p>
              <p className="text-[10px] text-[var(--edk-ink-3)] mt-0.5">Dashboard stats only — sales and inventory are unaffected.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => refetch()} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* ── Hard error ── */}
        {error && !loading && !dashboard?.error && (
          <div className="flex items-center gap-2 p-3 rounded-[var(--edk-radius)] bg-[var(--edk-red-soft)] border border-[var(--edk-red-border)]">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--edk-red)]" strokeWidth={2} aria-hidden />
            <div>
              <p className="text-[13px] font-bold text-[var(--edk-ink)]">Failed to load data</p>
              <p className="text-[11px] text-[var(--edk-ink-2)] mt-0.5">{error}</p>
              <p className="text-[10px] text-[var(--edk-ink-3)] mt-0.5">Dashboard only — sales and POS still work. Click Retry to try again.</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => refetch()} className="ml-auto">
              Retry
            </Button>
          </div>
        )}

        {/* ── Stat cards: mobile 2×2 with mobile spec; desktop original ── */}
        {isMobile ? (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <DashboardStatCardMobile
              label="Stock Value"
              value={stats ? formatGHCCompact(stats.totalStockValue) : '—'}
              variant="blue"
              loading={statLoading}
            />
            <DashboardStatCardMobile
              label="Products"
              value={stats?.totalProducts ?? '—'}
              loading={statLoading}
            />
            <DashboardStatCardMobile
              label="Low Stock"
              value={stats ? stats.lowStockCount + stats.outOfStockCount : '—'}
              valueColor="red"
              loading={statLoading}
            />
            <DashboardStatCardMobile
              label="Today's Sales"
              value={stats ? formatGHCCompact(stats.todaysSales) : '—'}
              valueColor="blue"
              loading={statLoading}
            />
          </div>
        ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Stock Value"
            value={stats ? formatGHCCompact(stats.totalStockValue) : '—'}
            icon={DollarSign}
            variant="default"
            loading={statLoading}
          />
          <StatCard
            label="Total Products"
            value={stats?.totalProducts ?? '—'}
            icon={Package}
            loading={statLoading}
          />
          <StatCard
            label="Low Stock Items"
            value={stats ? stats.lowStockCount + stats.outOfStockCount : '—'}
            icon={AlertTriangle}
            variant={stats && stats.lowStockCount + stats.outOfStockCount > 0 ? 'amber' : 'default'}
            loading={statLoading}
          />
          <StatCard
            label="Today's Sales"
            value={stats ? formatGHCCompact(stats.todaysSales) : '—'}
            icon={Receipt}
            variant="green"
            loading={statLoading}
          />
        </div>
        )}

        {/* ── Low stock alerts ── */}
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--edk-border)] flex-wrap gap-2">
            <div>
              <h2 className="text-[14px] font-bold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Stock Alerts
              </h2>
              <p className="text-[11px] text-[var(--edk-ink-3)] mt-0.5">
                {warehouseName} — products at or below reorder level
              </p>
            </div>
            {(() => {
              const items = dashboard?.lowStockItems ?? [];
              const outCount = items.filter((i) => i.quantity === 0).length;
              if (outCount === 0) return null;
              return (
                <Badge variant="danger" size="md">
                  {outCount} out of stock
                </Badge>
              );
            })()}
          </div>
          {loading ? (
            <div className="flex flex-col items-center gap-3 p-4">
              <LoadingSpinner size="sm" />
              <p className="text-[12px] font-medium text-[var(--edk-ink-3)]">Loading…</p>
              <div className="w-full space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-[var(--edk-border-mid)] rounded-[var(--edk-radius-sm)] animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <LowStockTable items={dashboard?.lowStockItems ?? []} />
          )}
        </div>

        {/* ── Category breakdown ── */}
        {!loading && dashboard?.categorySummary && typeof dashboard.categorySummary === 'object' && Object.keys(dashboard.categorySummary).length > 0 && (
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--edk-border)]">
              <h2 className="text-[14px] font-bold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                By Category
              </h2>
              <p className="text-[11px] text-[var(--edk-ink-3)] mt-0.5">{warehouseName}</p>
            </div>
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(dashboard.categorySummary)
                .sort((a, b) => b[1].value - a[1].value)
                .map(([cat, { count, value }]) => (
                  <div
                    key={cat}
                    className="flex flex-col gap-0.5 p-3 rounded-[var(--edk-radius-sm)] bg-[var(--edk-surface-2)] border border-[var(--edk-border-mid)]"
                  >
                    <span className="text-[11px] font-bold text-[var(--edk-ink-3)] uppercase tracking-wider">{cat}</span>
                    <span className="text-[16px] font-semibold text-[var(--edk-ink)] font-mono" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{count} SKUs</span>
                    <span className="text-[10px] text-[var(--edk-ink-2)] font-medium font-mono" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{formatGHC(value)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
