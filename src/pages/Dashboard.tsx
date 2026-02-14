import { Package, DollarSign, AlertTriangle, ShoppingBag, Store as StoreIcon, MapPin, Shield, Settings, Users, BarChart3, LayoutGrid } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatCard } from '../components/dashboard/StatCard';
import { SalesChart } from '../components/dashboard/SalesChart';
import { TopProducts } from '../components/dashboard/TopProducts';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { QuickActions } from '../components/dashboard/QuickActions';
import { SyncRejectionsCard } from '../components/dashboard/SyncRejectionsCard';
import { useInventory } from '../contexts/InventoryContext';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../contexts/StoreContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useMemo, useState, useEffect } from 'react';
import { InventoryActivity } from '../types';
import { fetchTransactionsFromApi } from '../services/transactionsApi';
import { API_BASE_URL } from '../lib/api';
import { formatCurrency } from '../lib/utils';
import { Button } from '../components/ui/Button';

export function Dashboard() {
  const { products } = useInventory();
  const { user } = useAuth();
  const { stores, currentStore } = useStore();
  const { warehouses, currentWarehouse } = useWarehouse();
  const navigate = useNavigate();
  const [todaySales, setTodaySales] = useState(0);
  const [todayTransactions, setTodayTransactions] = useState(0);
  const [salesByStore, setSalesByStore] = useState<Array<{ storeId: string | null; storeName: string; revenue: number; count: number }>>([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isSuperAdmin = user?.role === 'super_admin';
  const adminRoleLabel = isSuperAdmin ? 'Super Admin' : 'Admin';
  useEffect(() => {
    if (!isAdmin) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    fetchTransactionsFromApi(API_BASE_URL, {
      from: start.toISOString(),
      to: end.toISOString(),
      limit: 500,
    })
      .then(({ data }) => {
        const completed = data.filter((t) => t.status === 'completed');
        setTodayTransactions(completed.length);
        setTodaySales(completed.reduce((sum, t) => sum + t.total, 0));
      })
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    fetchTransactionsFromApi(API_BASE_URL, { from: start.toISOString(), to: end.toISOString(), limit: 2000 })
      .then(({ data }) => {
        const completed = data.filter((t) => t.status === 'completed');
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
      .catch(() => setSalesByStore([]));
  }, [isAdmin, stores]);

  const stats = useMemo(() => {
    const totalProducts = products.length;
    const totalStockValue = products.reduce((sum, p) => sum + (p.quantity * p.costPrice), 0);
    const lowStockItems = products.filter(p => p.quantity > 0 && p.quantity <= p.reorderLevel).length;
    const outOfStockItems = products.filter(p => p.quantity === 0).length;
    
    return {
      totalProducts,
      totalStockValue,
      lowStockItems,
      outOfStockItems,
      todaySales,
      todayTransactions,
      monthSales: 0,
      topProducts: [],
    };
  }, [products, todaySales, todayTransactions]);

  const salesData = useMemo(() => [], []);

  const recentActivity = useMemo<InventoryActivity[]>(() => [], []);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isAdmin ? 'Admin Control Panel' : 'Dashboard'}
          </h1>
          {isAdmin && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-white shadow-sm">
              <Shield className="w-3.5 h-3.5" aria-hidden />
              {adminRoleLabel}
            </span>
          )}
        </div>
        <p className="text-slate-500 text-sm mb-2">
          {isAdmin
            ? 'Full system access — inventory, POS, reports, users & settings.'
            : 'Inventory, suppliers & point of sale in one place'}
        </p>
        {isAdmin ? (
          <p className="text-slate-600 text-sm">
            All locations and features are available. Use the sidebar or quick actions below.
          </p>
        ) : (
          <>
            {(currentStore || currentWarehouse) && (
              <p className="text-sm text-slate-600 font-medium flex items-center gap-2 flex-wrap">
                <StoreIcon className="w-4 h-4 text-slate-500" aria-hidden />
                You&apos;re at: {currentStore?.name ?? '—'}{currentStore && currentWarehouse ? ', ' : ''}{currentWarehouse?.name ?? ''}
              </p>
            )}
            <p className="text-slate-500 text-sm mt-1">Welcome back! Here&apos;s what&apos;s happening today.</p>
          </>
        )}
      </div>

      {/* Admin-only: quick access to all control areas */}
      {isAdmin && (
        <div className="solid-card p-6 animate-fade-in-up border-slate-200/60">
          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-slate-600" />
            Admin quick access
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/inventory')}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 hover:border-slate-300 text-left"
            >
              <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                <Package className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-900 text-sm">Inventory</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/pos')}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 hover:border-slate-300 text-left"
            >
              <div className="p-2 rounded-lg bg-green-100 text-green-600">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-900 text-sm">POS</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/reports')}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 hover:border-slate-300 text-left"
            >
              <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                <BarChart3 className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-900 text-sm">Reports</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/settings?tab=users')}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 hover:border-slate-300 text-left"
            >
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                <Users className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-900 text-sm">User management</span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/settings')}
              className="flex items-center gap-3 p-4 rounded-xl border border-slate-200/60 bg-white hover:bg-slate-50 hover:border-slate-300 text-left"
            >
              <div className="p-2 rounded-lg bg-slate-100 text-slate-600">
                <Settings className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-900 text-sm">Settings</span>
            </Button>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in-up">
        <StatCard
          title="Total Stock Value"
          value={stats.totalStockValue}
          icon={DollarSign}
          format="currency"
          color="blue"
          trend={{ value: 12.5, isPositive: true }}
        />
        <StatCard
          title="Total Products"
          value={stats.totalProducts}
          icon={Package}
          format="number"
          color="green"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.lowStockItems}
          icon={AlertTriangle}
          format="number"
          color="amber"
        />
        <StatCard
          title="Today's Sales"
          value={stats.todaySales}
          icon={ShoppingBag}
          format="currency"
          color="green"
          trend={{ value: 8.2, isPositive: true }}
        />
      </div>

      {/* Phase 4: Failed offline syncs (admin only) */}
      {isAdmin && <SyncRejectionsCard />}

      {/* Sales by store (Phase 3) — graceful when no stores */}
      {salesByStore.length > 0 && (
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

      {/* Charts and Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SalesChart data={salesData} />
        </div>
        <div>
          <TopProducts products={stats.topProducts} />
        </div>
      </div>

      {/* Recent Activity and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentActivity activities={recentActivity} />
        </div>
        <div>
          <QuickActions />
        </div>
      </div>

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
