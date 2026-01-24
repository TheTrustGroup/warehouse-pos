import { TrendingUp, DollarSign, ShoppingBag, Package, CreditCard } from 'lucide-react';
import { SalesReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';

interface SalesMetricsProps {
  report: SalesReport;
}

export function SalesMetrics({ report }: SalesMetricsProps) {
  const metrics = [
    {
      label: 'Total Revenue',
      value: formatCurrency(report.totalRevenue),
      icon: DollarSign,
      color: 'blue',
    },
    {
      label: 'Total Profit',
      value: formatCurrency(report.totalProfit),
      icon: TrendingUp,
      color: 'green',
    },
    {
      label: 'Transactions',
      value: report.totalTransactions.toString(),
      icon: ShoppingBag,
      color: 'purple',
    },
    {
      label: 'Items Sold',
      value: report.totalItemsSold.toString(),
      icon: Package,
      color: 'amber',
    },
    {
      label: 'Avg Order Value',
      value: formatCurrency(report.averageOrderValue),
      icon: CreditCard,
      color: 'indigo',
    },
    {
      label: 'Profit Margin',
      value: `${report.totalRevenue > 0 ? ((report.totalProfit / report.totalRevenue) * 100).toFixed(1) : '0.0'}%`,
      icon: TrendingUp,
      color: 'green',
    },
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {metrics.map((metric, idx) => (
        <div key={idx} className="glass-card animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600 mb-2">{metric.label}</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{metric.value}</p>
            </div>
            <div className={`p-3.5 rounded-xl border backdrop-blur-[10px] ${colorClasses[metric.color]} flex-shrink-0 ml-4`}>
              <metric.icon className="w-5 h-5" strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
