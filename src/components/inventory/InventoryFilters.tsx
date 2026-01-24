import { ProductFilters } from '../../contexts/InventoryContext';
import { X, Filter } from 'lucide-react';

interface InventoryFiltersProps {
  filters: ProductFilters;
  onFiltersChange: (filters: ProductFilters) => void;
  categories: string[];
}

export function InventoryFilters({ filters, onFiltersChange, categories }: InventoryFiltersProps) {
  const hasActiveFilters = Object.values(filters).some(v => v !== undefined && v !== '' && v !== false);

  const clearFilters = () => {
    onFiltersChange({});
  };

  return (
    <div className="glass-card animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary-600" strokeWidth={2} />
          <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wider">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1.5 transition-colors"
          >
            <X className="w-4 h-4" />
            Clear All
          </button>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-2">
            Category
          </label>
          <select
            value={filters.category || ''}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value || undefined })}
            className="input-field"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              Min Quantity
            </label>
            <input
              type="number"
              min="0"
              value={filters.minQuantity || ''}
              onChange={(e) => onFiltersChange({ 
                ...filters, 
                minQuantity: e.target.value ? Number(e.target.value) : undefined 
              })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              Max Quantity
            </label>
            <input
              type="number"
              min="0"
              value={filters.maxQuantity || ''}
              onChange={(e) => onFiltersChange({ 
                ...filters, 
                maxQuantity: e.target.value ? Number(e.target.value) : undefined 
              })}
              className="input-field"
            />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={filters.lowStock || false}
              onChange={(e) => onFiltersChange({ ...filters, lowStock: e.target.checked || undefined })}
              className="rounded border-slate-300 w-4 h-4 cursor-pointer group-hover:border-primary-400 transition-colors"
            />
            <span className="text-sm font-medium text-slate-700">Low Stock Only</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={filters.outOfStock || false}
              onChange={(e) => onFiltersChange({ ...filters, outOfStock: e.target.checked || undefined })}
              className="rounded border-slate-300 w-4 h-4 cursor-pointer group-hover:border-primary-400 transition-colors"
            />
            <span className="text-sm font-medium text-slate-700">Out of Stock Only</span>
          </label>
        </div>
      </div>
    </div>
  );
}
