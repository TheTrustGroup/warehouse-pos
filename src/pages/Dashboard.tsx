import { Package, DollarSign, AlertTriangle, ShoppingBag, Store as StoreIcon, MapPin, Shield, RefreshCw, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/dashboard/StatCard';
import { SalesChart } from '../components/dashboard/SalesChart';
import { TopProducts } from '../components/dashboard/TopProducts';
import { SyncRejectionsCard } from '../components/dashboard/SyncRejectionsCard';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useMemo, useState, useEffect, useCallback } from 'react';
import { fetchTransactionsFromApi } from '../services/transactionsApi';
import { API_BASE_URL } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { computeDashboardStats } from '../lib/dashboardStats';
import { Button } from '../components/ui/Button';

export function Dashboard() {
  const { products, isLoading: productsLoading } = useInventory();
  const { user } = useAuth();
  const { stores, currentStore } = useStore();
  const { warehouses, currentWarehouse } = useWarehouse();
  const navigate = useNavigate();
  const [todaySales, setTodaySales] = useState(0);
  const [todayTransactions, setTodayTransactions] = useState(0);
  const [salesByStore, setSalesByStore] = useState<Array<{ storeId: string | null; storeName: string; revenue: number; count: number }>>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const adminRoleLabel = isSuperAdmin ? 'Super Admin' : 'Admin';

  const loadDashboardData = useCallback(() => {
    if (!isAdmin) {
      setDashboardLoading(false);
      setDashboardError(null);
      return;
    }
    setDashboardError(null);
    setDashboardLoading(true);
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    const startMonth = new Date();
    startMonth.setDate(startMonth.getDate() - 30);
    const endMonth = new Date();
    Promise.all([
      fetchTransactionsFromApi(API_BASE_URL, { from: startToday.toISOString(), to: endToday.toISOString(), limit: 500 }),
      fetchTransactionsFromApi(API_BASE_URL, { from: startMonth.toISOString(), to: endMonth.toISOString(), limit: 2000 }),
    ])
      .then(([todayRes, monthRes]) => {
        const completedToday = todayRes.data.filter((t) => t.status === 'completed');
        setTodayTransactions(completedToday.length);
        setTodaySales(completedToday.reduce((sum, t) => sum + t.total, 0));
        const completed = monthRes.data.filter((t) => t.status === 'completed');
        const byStore = new Map<string | null, { revenue: number; count: number }>();
        completed.forEach((t) => {
          const key = t.storeId ?? null;
          const cur = byStore.get(key) ?? { revenue: 0, count: 0 };
          byStore.set(key, { revenue: cur.revenue + t.total, count: cur.count + 1 });
        });
        const storeNames = new Map<string, string>();
        stores.forEach((s) => storeNames.set(s.id, s.name));
        setSalesByStore(
          Array.from(byStore.entries()).map(([storeId, { revenue, count }]) => ({
            storeId,
            storeName: storeId ? (storeNames.get(storeId) ?? 'Unknown') : 'No store',
            revenue,
            count,
          }))
        );
      })
      .catch((err) => {
        setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard data. Check your connection.');
      })
      .finally(() => setDashboardLoading(false));
  }, [isAdmin, stores]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Single source of truth: same products as Inventory page (useInventory). Stats reflect current warehouse (WarehouseContext).
  const stats = useMemo(
    () => computeDashboardStats(products, todaySales, todayTransactions),
    [products, todaySales, todayTransactions]
  );

  const inventoryStatsReady = !productsLoading;

  const salesData = useMemo(() => [], []);

  return (
    <div className="min-h-[60vh] bg-slate-100 rounded-2xl lg:rounded-3xl p-6 lg:p-8 space-y-8">
      {isAdmin && dashboardError && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 animate-fade-in-up" role="alert">
          <p className="text-amber-900 text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" aria-hidden />
            {dashboardError}
          </p>
          <Button variant="primary" size="sm" onClick={() => loadDashboardData()} className="inline-flex items-center gap-2 shrink-0" aria-label="Retry loading dashboard">
            <RefreshCw className="w-4 h-4" />
            Retry
          </Button>
        </div>
      )}
      {isAdmin && dashboardLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in-up" role="status" aria-live="polite">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="solid-card p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 bg-slate-200 rounded-xl animate-pulse flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-24 bg-slate-100 rounded mb-2 animate-pulse" />
                  <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Page header — matches inventory page: text-[20px] font-bold */}
      <header className="animate-fade-in-up">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h1 className="text-[20px] font-bold text-slate-900 leading-tight">
            {isAdmin ? 'Admin Control Panel' : 'Dashboard'}
          </h1>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-white">
              <Shield className="w-3.5 h-3.5" aria-hidden />
              {adminRoleLabel}
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm flex items-center gap-2 flex-wrap">
          {isAdmin ? (
            'Full system access — inventory, POS, reports, users & settings.'
          ) : (currentStore || currentWarehouse) ? (
            <>
              <StoreIcon className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden />
              You&apos;re at: {currentStore?.name ?? '—'}{currentStore && currentWarehouse ? ', ' : ''}{currentWarehouse?.name ?? ''}
            </>
          ) : (
            'Inventory, suppliers & point of sale in one place'
          )}
        </p>
        {/* Single primary CTA: task-focused, does not duplicate sidebar nav */}
        <div className="mt-4">
          <Button
            type="button"
            variant="primary"
            onClick={() => navigate('/pos')}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl font-semibold"
            aria-label="Start a new sale"
          >
            <ShoppingCart className="w-5 h-5" aria-hidden />
            New sale
          </Button>
        </div>
      </header>

      {/* Stats Grid — hide for admin until dashboard data loaded; inventory stats show — until products loaded */}
      {(!isAdmin || !dashboardLoading) && (
      <div className="animate-fade-in-up">
        {currentWarehouse && (
          <p className="text-sm text-slate-500 mb-3 font-medium">
            Inventory stats for: <span className="text-slate-700">{currentWarehouse.name}</span>
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Stock Value"
            value={inventoryStatsReady ? stats.totalStockValue : '—'}
            icon={DollarSign}
            format={inventoryStatsReady ? 'currency' : 'text'}
            color="blue"
          />
          <StatCard
            title="Total Products"
            value={inventoryStatsReady ? stats.totalProducts : '—'}
            icon={Package}
            format={inventoryStatsReady ? 'number' : 'text'}
            color="green"
          />
          <StatCard
            title="Low Stock Items"
            value={inventoryStatsReady ? stats.lowStockItems : '—'}
            icon={AlertTriangle}
            format={inventoryStatsReady ? 'number' : 'text'}
            color="amber"
          />
          <StatCard
            title="Today's Sales"
            value={stats.todaySales}
            icon={ShoppingBag}
            format="currency"
            color="green"
          />
        </div>
      </div>
      )}

      {/* Phase 4: Failed offline syncs (admin only) */}
      {isAdmin && <SyncRejectionsCard />}

      {/* Sales by store (Phase 3) — graceful when no stores; hide while admin dashboard loading */}
      {!dashboardLoading && salesByStore.length > 0 && (
        <div className="solid-card p-6 animate-fade-in-up">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <StoreIcon className="w-5 h-5 text-slate-600" />
            Sales by store (last 30 days)
          </h3>
          <div className="table-scroll-wrap">
            <table className="w-full text-sm min-w-[260px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Store</th>
                  <th className="text-right py-2 font-medium text-slate-600">Transactions</th>
                  <th className="text-right py-2 font-medium text-slate-600">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {salesByStore.map((row) => (
                  <tr key={row.storeId ?? 'none'} className="border-b border-slate-100">
                    <td className="py-2 text-slate-900">{row.storeName}</td>
                    <td className="py-2 text-right text-slate-600">{row.count}</td>
                    <td className="py-2 text-right font-medium text-slate-900">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warehouse → Store mapping (Phase 3) — graceful when no stores */}
      {stores.length > 0 && warehouses.length > 0 && (
        <div className="solid-card p-6 animate-fade-in-up">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-slate-600" />
            Warehouse → Store
          </h3>
          <div className="table-scroll-wrap">
            <table className="w-full text-sm min-w-[260px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 font-medium text-slate-600">Warehouse</th>
                  <th className="text-left py-2 font-medium text-slate-600">Store</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} className="border-b border-slate-100">
                    <td className="py-2 text-slate-900">{w.name}</td>
                    <td className="py-2 text-slate-600">{w.storeId ? stores.find((s) => s.id === w.storeId)?.name ?? '—' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts and Top Products — only when data exists to avoid empty clutter */}
      {(salesData.length > 0 || stats.topProducts.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {salesData.length > 0 && (
            <div className="lg:col-span-2">
              <SalesChart data={salesData} />
            </div>
          )}
          {stats.topProducts.length > 0 && (
            <div>
              <TopProducts products={stats.topProducts} />
            </div>
          )}
        </div>
      )}

      {/* Alerts Section */}
      {stats.lowStockItems > 0 && (
        <div className="solid-card bg-amber-50 border-amber-200 animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-amber-100/80 rounded-lg border border-amber-200/30">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 mb-1">Low Stock Alert</h4>
              <p className="text-sm text-amber-700 mb-3">
                You have {stats.lowStockItems} product{stats.lowStockItems > 1 ? 's' : ''} running low on stock.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/inventory?filter=lowStock')}
                className="text-sm font-semibold text-amber-900 hover:text-amber-700 min-h-0 py-0"
              >
                View Low Stock Items →
              </Button>
            </div>
          </div>
        </div>
      )}

      {stats.outOfStockItems > 0 && (
        <div className="solid-card bg-red-50 border-red-200 animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-red-100/80 rounded-lg border border-red-200/30">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-red-900 mb-1">Out of Stock Alert</h4>
              <p className="text-sm text-red-700 mb-3">
                You have {stats.outOfStockItems} product{stats.outOfStockItems > 1 ? 's' : ''} out of stock.
              </p>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate('/inventory?filter=outOfStock')}
                className="text-sm font-semibold text-red-900 hover:text-red-700 min-h-0 py-0"
              >
                Restock Now →
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
