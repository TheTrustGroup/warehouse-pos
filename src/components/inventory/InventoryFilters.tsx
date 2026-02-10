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
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" strokeWidth={2} aria-hidden />
          <h3 className="text-sm font-medium text-slate-700">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-primary-600 hover:text-primary-700 flex items-center gap-1.5 min-h-touch"
            aria-label="Clear all filters"
          >
            <X className="w-4 h-4" />
            Clear all
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Category</label>
          <select
            value={filters.category || ''}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value || undefined })}
            className="input-field"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Min quantity</label>
            <input
              type="number"
              min="0"
              value={filters.minQuantity || ''}
              onChange={(e) => onFiltersChange({ ...filters, minQuantity: e.target.value ? Number(e.target.value) : undefined })}
              className="input-field"
              aria-label="Minimum quantity"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">Max quantity</label>
            <input
              type="number"
              min="0"
              value={filters.maxQuantity || ''}
              onChange={(e) => onFiltersChange({ ...filters, maxQuantity: e.target.value ? Number(e.target.value) : undefined })}
              className="input-field"
              aria-label="Maximum quantity"
            />
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <label className="flex items-center gap-3 cursor-pointer min-h-touch">
            <input
              type="checkbox"
              checked={filters.lowStock || false}
              onChange={(e) => onFiltersChange({ ...filters, lowStock: e.target.checked || undefined })}
              className="rounded border-slate-300 w-4 h-4 cursor-pointer"
              aria-label="Low stock only"
            />
            <span className="text-sm font-medium text-slate-700">Low stock only</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer min-h-touch">
            <input
              type="checkbox"
              checked={filters.outOfStock || false}
              onChange={(e) => onFiltersChange({ ...filters, outOfStock: e.target.checked || undefined })}
              className="rounded border-slate-300 w-4 h-4 cursor-pointer"
              aria-label="Out of stock only"
            />
            <span className="text-sm font-medium text-slate-700">Out of stock only</span>
          </label>
        </div>
      </div>
    </div>
  );
}
