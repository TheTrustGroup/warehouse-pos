import { Package, AlertTriangle, TrendingDown, DollarSign } from 'lucide-react';
import { InventoryReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';

interface InventoryMetricsProps {
  report: InventoryReport;
}

export function InventoryMetrics({ report }: InventoryMetricsProps) {
  const metrics = [
    {
      label: 'Total Products',
      value: report.totalProducts.toString(),
      icon: Package,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Total Stock Value',
      value: formatCurrency(report.totalStockValue),
      icon: DollarSign,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Low Stock Items',
      value: report.lowStockItems.toString(),
      icon: AlertTriangle,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Out of Stock',
      value: report.outOfStockItems.toString(),
      icon: TrendingDown,
      color: 'bg-red-50 text-red-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, idx) => (
        <div key={idx} className="glass-card animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600 mb-2">{metric.label}</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{metric.value}</p>
            </div>
            <div className={`p-3.5 rounded-xl border backdrop-blur-[10px] ${metric.color} flex-shrink-0 ml-4`}>
              <metric.icon className="w-5 h-5" strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
