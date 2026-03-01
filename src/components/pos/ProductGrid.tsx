import { useMemo } from 'react';
import POSProductCard from './POSProductCard';
import type { POSProduct } from './SizePickerSheet';

export type { POSProduct };

/** Color filter options — match inventory (InventoryPage). */
const COLOR_OPTIONS = ['All', 'Black', 'White', 'Red', 'Blue', 'Brown', 'Green', 'Grey', 'Navy', 'Beige', 'Multi', 'Uncategorized'];

interface ProductGridProps {
  products: POSProduct[];
  loading: boolean;
  search: string;
  category: string;
  sizeFilter: string;
  colorFilter: string;
  onSelect: (product: POSProduct) => void;
  onClearSearch: () => void;
  onCategoryChange: (category: string) => void;
  onSizeFilterChange: (value: string) => void;
  onColorFilterChange: (value: string) => void;
}

function applyFilters(
  list: POSProduct[],
  search: string,
  category: string,
  sizeFilter: string,
  colorFilter: string
): POSProduct[] {
  let r = [...list];
  if (search.trim()) {
    const q = search.toLowerCase().trim();
    r = r.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
    );
  }
  if (category && category !== 'all') {
    r = r.filter((p) => (p.category ?? 'Uncategorized').toLowerCase() === category.toLowerCase());
  }
  if (sizeFilter.trim()) {
    const sizeNorm = sizeFilter.trim().toLowerCase();
    r = r.filter((p) => {
      if (sizeNorm === 'na') return (p.sizeKind ?? 'na') === 'na';
      if (sizeNorm === 'one size') return (p.sizeKind ?? 'na') === 'one_size';
      const qbs = p.quantityBySize ?? [];
      return qbs.some((s) => (s.sizeCode ?? '').toLowerCase() === sizeNorm);
    });
  }
  if (colorFilter.trim()) {
    const colorNorm = colorFilter.trim().toLowerCase();
    if (colorNorm === 'uncategorized') {
      r = r.filter((p) => !(p.color ?? '').trim());
    } else {
      r = r.filter((p) => (p.color ?? '').trim().toLowerCase() === colorNorm);
    }
  }
  return r;
}

export default function ProductGrid({
  products,
  loading,
  search,
  category,
  sizeFilter,
  colorFilter,
  onSelect,
  onClearSearch,
  onCategoryChange,
  onSizeFilterChange,
  onColorFilterChange,
}: ProductGridProps) {
  const categories = useMemo(() => {
    const set = new Set<string>(['all']);
    products.forEach((p) => (p.category ? set.add(p.category) : set.add('Uncategorized')));
    return Array.from(set).sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)));
  }, [products]);

  const uniqueSizes = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.sizeKind === 'na') set.add('NA');
      else if (p.sizeKind === 'one_size') set.add('One size');
      else for (const s of p.quantityBySize ?? []) if (s.sizeCode) set.add(s.sizeCode);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = useMemo(
    () => applyFilters(products, search, category, sizeFilter, colorFilter),
    [products, search, category, sizeFilter, colorFilter]
  );

  const hasActiveFilters = Boolean(search.trim() || (category && category !== 'all') || sizeFilter.trim() || colorFilter.trim());

  const handleClearFilters = () => {
    onClearSearch();
    onCategoryChange('all');
    onSizeFilterChange('');
    onColorFilterChange('');
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-slate-500">
          {hasActiveFilters ? 'No products match the current filters.' : 'No products in this category.'}
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onCategoryChange(cat)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  category === cat ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        )}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Size</span>
          <select
            value={sizeFilter}
            onChange={(e) => onSizeFilterChange(e.target.value)}
            className="min-w-[100px] cursor-pointer rounded-full border border-slate-200 bg-white pl-2.5 pr-7 py-2 text-[12px] font-medium text-slate-700"
            aria-label="Filter by size"
          >
            <option value="">All</option>
            {uniqueSizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Color</span>
          <div className="flex flex-wrap gap-1.5">
            {COLOR_OPTIONS.map((c) => {
              const value = c === 'All' ? '' : c;
              const selected = colorFilter.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorFilterChange(value)}
                  className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    selected
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                  }`}
                  aria-pressed={selected}
                  aria-label={`Filter by color: ${c}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="flex-shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:border-slate-400"
          >
            Clear filters
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((p) => (
          <POSProductCard key={p.id} product={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
