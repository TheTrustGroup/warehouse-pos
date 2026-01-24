import { Package, DollarSign, AlertTriangle, ShoppingBag } from 'lucide-react';
import { StatCard } from '../components/dashboard/StatCard';
import { SalesChart } from '../components/dashboard/SalesChart';
import { TopProducts } from '../components/dashboard/TopProducts';
import { RecentActivity } from '../components/dashboard/RecentActivity';
import { QuickActions } from '../components/dashboard/QuickActions';
import { getMockDashboardStats, getMockSalesData, getMockRecentActivity } from '../services/mockData';

export function Dashboard() {
  const stats = getMockDashboardStats();
  const salesData = getMockSalesData();
  const recentActivity = getMockRecentActivity();

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="text-[32px] font-bold text-slate-900 tracking-tight mb-2">Dashboard</h1>
        <p className="text-slate-500 text-sm">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 animate-fade-in-up">
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
        <div className="glass-card bg-amber-50/80 border-amber-200/50 animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-amber-100/80 rounded-lg border border-amber-200/30">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-amber-900 mb-1">Low Stock Alert</h4>
              <p className="text-sm text-amber-700 mb-3">
                You have {stats.lowStockItems} product{stats.lowStockItems > 1 ? 's' : ''} running low on stock.
              </p>
              <button className="text-sm font-semibold text-amber-900 hover:text-amber-700 transition-colors">
                View Low Stock Items →
              </button>
            </div>
          </div>
        </div>
      )}

      {stats.outOfStockItems > 0 && (
        <div className="glass-card bg-red-50/80 border-red-200/50 animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-red-100/80 rounded-lg border border-red-200/30">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-red-900 mb-1">Out of Stock Alert</h4>
              <p className="text-sm text-red-700 mb-3">
                You have {stats.outOfStockItems} product{stats.outOfStockItems > 1 ? 's' : ''} out of stock.
              </p>
              <button className="text-sm font-semibold text-red-900 hover:text-red-700 transition-colors">
                Restock Now →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
