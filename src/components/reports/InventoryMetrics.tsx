import { Package, AlertTriangle, TrendingDown, DollarSign, Info } from 'lucide-react';
import { InventoryReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';

export interface InventorySnapshot {
  stockValueAtCost: number;
  stockValueAtSelling: number;
  potentialProfit: number;
}

interface InventoryMetricsProps {
  report: InventoryReport;
  /** When provided, shows Stock value (at cost), (at selling price), and Potential profit in stock. */
  snapshot?: InventorySnapshot;
}

const atCostDesc = 'Value of current inventory at what you paid (cost price × quantity). Used for accounting and margin.';
const atSellingDesc = 'Value of current inventory if sold at listed selling price (selling price × quantity).';
const potentialProfitDesc = 'Selling value minus cost value. Profit you would make if all stock sold at current prices.';

export function InventoryMetrics({ report, snapshot }: InventoryMetricsProps) {
  const metrics = [
    {
      label: 'Total Products',
      value: report.totalProducts.toString(),
      icon: Package,
      color: 'bg-blue-50 text-blue-600',
      tooltip: undefined as string | undefined,
    },
    ...(snapshot
      ? [
          { label: 'Stock value (at cost)', value: formatCurrency(snapshot.stockValueAtCost), icon: DollarSign, color: 'bg-slate-50 text-slate-600', tooltip: atCostDesc },
          { label: 'Stock value (at selling price)', value: formatCurrency(snapshot.stockValueAtSelling), icon: DollarSign, color: 'bg-green-50 text-green-600', tooltip: atSellingDesc },
          { label: 'Potential profit in stock', value: formatCurrency(snapshot.potentialProfit), icon: DollarSign, color: 'bg-amber-50 text-amber-600', tooltip: potentialProfitDesc },
        ]
      : [
          { label: 'Total Stock Value', value: formatCurrency(report.totalStockValue), icon: DollarSign, color: 'bg-green-50 text-green-600', tooltip: undefined as string | undefined },
        ]),
    {
      label: 'Low Stock Items',
      value: report.lowStockItems.toString(),
      icon: AlertTriangle,
      color: 'bg-amber-50 text-amber-600',
      tooltip: undefined as string | undefined,
    },
    {
      label: 'Out of Stock',
      value: report.outOfStockItems.toString(),
      icon: TrendingDown,
      color: 'bg-red-50 text-red-600',
      tooltip: undefined as string | undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {metrics.map((metric, idx) => (
        <div key={idx} className="solid-card animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms` }} title={metric.tooltip}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-600 mb-2 flex items-center gap-1.5">
                {metric.label}
                {metric.tooltip && (
                  <span className="text-slate-400 hover:text-slate-600" title={metric.tooltip} aria-label="Metric description">
                    <Info className="w-3.5 h-3.5" strokeWidth={2} />
                  </span>
                )}
              </p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight">{metric.value}</p>
            </div>
            <div className={`p-3.5 rounded-xl border ${metric.color} flex-shrink-0 ml-4`}>
              <metric.icon className="w-5 h-5" strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
