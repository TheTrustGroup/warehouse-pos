import { useMemo } from 'react';
import POSProductCard from './POSProductCard';
import type { POSProduct } from './SizePickerSheet';

export type { POSProduct };

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
    <div className="p-4 flex flex-col gap-3">
      {/* Category tabs: horizontal scroll, active dark, inactive white */}
      {categories.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={`flex-shrink-0 h-[30px] px-3 rounded-[var(--edk-radius-sm)] text-[12px] font-medium whitespace-nowrap transition-colors ${
                category === cat
                  ? 'bg-[var(--edk-ink)] text-white border border-[var(--edk-ink)]'
                  : 'bg-[var(--edk-surface)] text-[var(--edk-ink-2)] border border-[var(--edk-border-mid)] hover:bg-[var(--edk-bg)]'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {filtered.map((p) => (
          <POSProductCard key={p.id} product={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
