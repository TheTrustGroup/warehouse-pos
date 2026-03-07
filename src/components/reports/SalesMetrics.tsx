import { TrendingUp, DollarSign, ShoppingBag, Package, CreditCard, Info } from 'lucide-react';
import { SalesReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';

interface SalesMetricsProps {
  report: SalesReport;
}

const netProfitTooltip = 'Profit from sales after cost of goods (Revenue − COGS). Full net profit would also subtract operating expenses, taxes, etc., when tracked.';

export function SalesMetrics({ report }: SalesMetricsProps) {
  const marginPct = report.totalRevenue > 0 ? ((report.totalProfit / report.totalRevenue) * 100).toFixed(1) : '0.0';
  const metrics = [
    {
      label: 'Total Revenue',
      value: formatCurrency(report.totalRevenue),
      icon: DollarSign,
      color: 'blue',
      tooltip: undefined as string | undefined,
    },
    ...(report.totalCogs != null
      ? [{
          label: 'Cost of Goods',
          value: formatCurrency(report.totalCogs),
          icon: DollarSign,
          color: 'slate' as const,
          tooltip: undefined as string | undefined,
        }]
      : []),
    {
      label: 'Gross Profit',
      value: formatCurrency(report.totalProfit),
      icon: TrendingUp,
      color: 'green',
      tooltip: undefined as string | undefined,
    },
    {
      label: 'Net profit',
      value: formatCurrency(report.totalProfit),
      icon: TrendingUp,
      color: 'green',
      tooltip: netProfitTooltip,
    },
    {
      label: 'Transactions',
      value: report.totalTransactions.toString(),
      icon: ShoppingBag,
      color: 'purple',
      tooltip: undefined as string | undefined,
    },
    {
      label: 'Items Sold',
      value: report.totalItemsSold.toString(),
      icon: Package,
      color: 'amber',
      tooltip: undefined as string | undefined,
    },
    {
      label: 'Avg Order Value',
      value: formatCurrency(report.averageOrderValue),
      icon: CreditCard,
      color: 'indigo',
      tooltip: undefined as string | undefined,
    },
    {
      label: 'Profit Margin',
      value: `${marginPct}%`,
      icon: TrendingUp,
      color: 'green',
      tooltip: undefined as string | undefined,
    },
  ];

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    slate: 'bg-slate-50 text-slate-600',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {metrics.map((metric, idx) => (
        <div key={idx} className="solid-card animate-fade-in-up" style={{ animationDelay: `${idx * 50}ms` }}>
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
            <div className={`p-3.5 rounded-xl border ${colorClasses[metric.color]} flex-shrink-0 ml-4`}>
              <metric.icon className="w-5 h-5" strokeWidth={2} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
