import { Product } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { Package, Edit, Trash2, AlertTriangle } from 'lucide-react';

interface ProductGridViewProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canSelect?: boolean;
  showCostPrice?: boolean;
}

export function ProductGridView({
  products,
  onEdit,
  onDelete,
  selectedIds,
  onSelectChange,
  canEdit = true,
  canDelete = true,
  canSelect = true,
  showCostPrice: _showCostPrice = true,
}: ProductGridViewProps) {
  const handleSelectOne = (id: string, checked: boolean) => {
    onSelectChange(
      checked 
        ? [...selectedIds, id]
        : selectedIds.filter(sid => sid !== id)
    );
  };

  const getStockStatus = (product: Product) => {
    if (product.quantity === 0) return { label: 'Out of Stock', color: 'border-red-200 bg-red-50' };
    if (product.quantity <= product.reorderLevel) return { label: 'Low Stock', color: 'border-amber-200 bg-amber-50' };
    return { label: 'In Stock', color: 'border-green-200 bg-green-50' };
  };

  /* Grid: consistent gap-5, no animation delay (calm, predictable) */
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {products.map((product) => {
        const status = getStockStatus(product);
        const isSelected = selectedIds.includes(product.id);

        return (
          <div
            key={product.id}
            className={`glass-card group cursor-pointer relative ${
              canSelect && isSelected ? 'ring-2 ring-primary-500 ring-offset-2' : ''
            }`}
          >
            {canSelect && (
              <div className="absolute top-4 left-4 z-10">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => handleSelectOne(product.id, e.target.checked)}
                  className="rounded border-slate-300 w-5 h-5 cursor-pointer shadow-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            
            {product.images[0] ? (
              <img 
                src={product.images[0]} 
                alt={product.name}
                loading="lazy"
                className="w-full h-40 object-cover rounded-xl mb-4 group-hover:scale-105 transition-transform duration-300 shadow-md"
              />
            ) : (
              <div className="w-full h-48 bg-slate-100/80 backdrop-blur-[10px] rounded-lg mb-4 flex items-center justify-center border border-slate-200/50">
                <Package className="w-16 h-16 text-slate-400" />
              </div>
            )}

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-lg text-slate-900 mb-1.5">{product.name}</h3>
                <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{product.description}</p>
              </div>

              <div className="flex items-center justify-between text-sm py-2 px-3 bg-slate-50/80 rounded-lg border border-slate-200/50">
                <span className="text-slate-500 font-medium">SKU:</span>
                <span className="font-semibold text-slate-900">{product.sku}</span>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-2xl font-bold gradient-text tracking-tight">
                  {formatCurrency(product.sellingPrice)}
                </span>
                <span className={`badge ${
                  status.label === 'In Stock' 
                    ? 'badge-success' 
                    : status.label === 'Low Stock' 
                    ? 'badge-warning' 
                    : 'badge-error'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                  {product.quantity} left
                </span>
              </div>

              {(product.quantity === 0 || product.quantity <= product.reorderLevel) && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50/80 backdrop-blur-[10px] px-3 py-2 rounded-lg border border-amber-200/30">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-xs font-semibold">{status.label}</span>
                </div>
              )}

              {(canEdit || canDelete) && (
                <div className="flex gap-2 pt-3 border-t border-slate-200/50">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(product); }}
                      className="flex-1 min-h-touch py-2.5 px-3 rounded-xl bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors"
                      aria-label={`Edit ${product.name}`}
                    >
                      <Edit className="w-4 h-4" />
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Delete this product?')) onDelete(product.id);
                      }}
                      className="min-h-touch min-w-touch py-2.5 px-3 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center justify-center transition-colors"
                      aria-label={`Delete ${product.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {products.length === 0 && (
        <div className="col-span-full text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6 text-slate-400" aria-hidden />
          </div>
          <p className="text-slate-600 text-sm font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}
