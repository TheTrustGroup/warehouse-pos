import { useState } from 'react';
import { Product } from '../../types';
import { formatCurrency, getCategoryDisplay, getLocationDisplay } from '../../lib/utils';
import { Pencil, Trash2, Eye, Package } from 'lucide-react';

interface ProductTableViewProps {
  products: Product[];
  onEdit: (product: Product) => void;
  onDelete: (id: string) => void;
  onView: (product: Product) => void;
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canSelect?: boolean;
  showCostPrice?: boolean;
}

export function ProductTableView({
  products,
  onEdit,
  onDelete,
  onView,
  selectedIds,
  onSelectChange,
  canEdit = true,
  canDelete = true,
  canSelect = true,
  showCostPrice = true,
}: ProductTableViewProps) {
  const [sortField, setSortField] = useState<keyof Product>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: keyof Product) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedProducts = [...products].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc' 
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    return 0;
  });

  const handleSelectAll = (checked: boolean) => {
    onSelectChange(checked ? products.map(p => p.id) : []);
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    onSelectChange(
      checked 
        ? [...selectedIds, id]
        : selectedIds.filter(sid => sid !== id)
    );
  };

  const getStockStatus = (product: Product) => {
    if (product.quantity === 0) return { label: 'Out of Stock', color: 'text-red-600 bg-red-50' };
    if (product.quantity <= product.reorderLevel) return { label: 'Low Stock', color: 'text-amber-600 bg-amber-50' };
    return { label: 'In Stock', color: 'text-green-600 bg-green-50' };
  };

  /* Table: consistent cell padding; horizontal scroll on small screens; no clipped content */
  return (
    <div className="table-container">
      <div className="overflow-x-auto -mx-1 overscroll-x-contain">
        <table className="w-full min-w-[800px]">
          <thead className="table-header sticky top-0 z-10">
            <tr>
              {canSelect && (
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === products.length && products.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 w-4 h-4 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Image</th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-800"
                onClick={() => handleSort('name')}
              >
                <span className="inline-flex items-center gap-1">Product {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Category</th>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider cursor-pointer hover:text-slate-800"
                onClick={() => handleSort('quantity')}
              >
                <span className="inline-flex items-center gap-1">Stock {sortField === 'quantity' && (sortDirection === 'asc' ? '↑' : '↓')}</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Price</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Location</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Supplier</th>
              {(canEdit || canDelete) && (
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-28">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((product) => {
              const status = getStockStatus(product);
              return (
                <tr 
                  key={product.id} 
                  className="table-row"
                >
                  {canSelect && (
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={(e) => handleSelectOne(product.id, e.target.checked)}
                        className="rounded border-slate-300 w-4 h-4 cursor-pointer"
                        aria-label={`Select ${product.name}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3 align-middle">
                    {product.images[0] ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        loading="lazy"
                        className="w-14 h-14 rounded-lg object-cover shadow-sm border-2 border-white/80"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-slate-100/80 rounded-lg flex items-center justify-center border border-slate-200/50">
                        <Package className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div>
                      <p className="font-semibold text-slate-900 mb-1">{product.name}</p>
                      <p className="text-xs text-slate-500">{product.tags.join(', ')}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-middle text-sm text-slate-700 font-medium">{product.sku}</td>
                  <td className="px-4 py-3 align-middle">
                    <span className="badge badge-info">
                      {getCategoryDisplay(product.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">{product.quantity}</span>
                        <span className={`badge ${
                          status.label === 'In Stock'
                            ? 'badge-success'
                            : status.label === 'Low Stock'
                            ? 'badge-warning'
                            : 'badge-error'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {status.label}
                        </span>
                      </div>
                      {(product.sizeKind === 'sized' || (product.quantityBySize && product.quantityBySize.length > 0)) && product.quantityBySize && product.quantityBySize.length > 0 && (
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          {product.quantityBySize.map((s) => (
                            <span key={s.sizeCode}>{s.sizeLabel ?? s.sizeCode}: {s.quantity}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div>
                      <p className="font-semibold text-slate-900">{formatCurrency(product.sellingPrice)}</p>
                      {showCostPrice && (
                        <p className="text-xs text-slate-500 mt-0.5">Cost: {formatCurrency(product.costPrice)}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-middle text-sm text-slate-600 font-medium">
                    {getLocationDisplay(product.location)}
                  </td>
                  <td className="px-5 py-4 align-middle text-sm text-slate-700">
                    {product.supplier?.name || '—'}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onView(product)}
                          className="btn-action btn-action-view"
                          title="View"
                          aria-label={`View ${product.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => onEdit(product)}
                            className="btn-action btn-action-edit"
                            title="Edit"
                            aria-label={`Edit ${product.name}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => onDelete(product.id)}
                            className="btn-action btn-action-delete"
                            title="Delete"
                            aria-label={`Delete ${product.name}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {products.length === 0 && (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Package className="w-6 h-6 text-slate-400" aria-hidden />
          </div>
          <p className="text-slate-600 text-sm font-medium">No products found</p>
        </div>
      )}
    </div>
  );
}
