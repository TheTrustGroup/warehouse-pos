import { SalesReport } from '../../services/reportService';
import { formatCurrency } from '../../lib/utils';
import { TrendingUp } from 'lucide-react';

interface TopProductsTableProps {
  report: SalesReport;
}

export function TopProductsTable({ report }: TopProductsTableProps) {
  return (
    <div className="table-container animate-fade-in-up">
      <h3 className="text-lg font-semibold text-slate-900 mb-6 px-6 pt-6 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-emerald-600" strokeWidth={2} />
        Top Selling Products
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="table-header">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Rank</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Product</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Qty Sold</th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {report.topSellingProducts.map((product, idx) => (
              <tr key={idx} className="table-row">
                <td className="px-6 py-4 align-middle">
                  <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white font-bold text-sm shadow-primary">
                    {idx + 1}
                  </span>
                </td>
                <td className="px-6 py-4 align-middle font-semibold text-slate-900">{product.productName}</td>
                <td className="px-6 py-4 align-middle text-right text-slate-600 font-medium">{product.quantitySold}</td>
                <td className="px-6 py-4 align-middle text-right font-bold text-slate-900">
                  {formatCurrency(product.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
