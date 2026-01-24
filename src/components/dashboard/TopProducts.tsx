import { formatCurrency } from '../../lib/utils';

interface TopProductsProps {
  products: Array<{
    id: string;
    name: string;
    sales: number;
    revenue: number;
  }>;
}

export function TopProducts({ products }: TopProductsProps) {
  const maxRevenue = Math.max(...products.map(p => p.revenue));

  return (
    <div className="glass-card animate-fade-in-up">
      <h3 className="text-lg font-semibold text-slate-900 mb-6">Top Products</h3>
      <div className="space-y-5">
        {products.map((product, index) => (
          <div key={product.id} className="group">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white text-xs font-bold flex-shrink-0 shadow-primary">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{product.sales} units sold</p>
                </div>
              </div>
              <span className="font-bold text-slate-900 ml-4 flex-shrink-0">{formatCurrency(product.revenue)}</span>
            </div>
            <div className="w-full bg-slate-100/80 rounded-full h-2 overflow-hidden backdrop-blur-[10px]">
              <div 
                className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full transition-all duration-500 shadow-sm"
                style={{ width: `${(product.revenue / maxRevenue) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
