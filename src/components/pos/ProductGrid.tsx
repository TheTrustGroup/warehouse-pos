import { useMemo } from 'react';
import POSProductCard from './POSProductCard';
import type { POSProduct } from './SizePickerSheet';

export type { POSProduct };

interface ProductGridProps {
  products: POSProduct[];
  loading: boolean;
  search: string;
  category: string;
  onSelect: (product: POSProduct) => void;
  onClearSearch: () => void;
  onCategoryChange: (category: string) => void;
}

export default function ProductGrid({
  products,
  loading,
  search,
  category,
  onSelect,
  onClearSearch,
  onCategoryChange,
}: ProductGridProps) {
  const categories = useMemo(() => {
    const set = new Set<string>(['all']);
    products.forEach((p) => (p.category ? set.add(p.category) : set.add('Uncategorized')));
    return Array.from(set).sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)));
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    if (category && category !== 'all') {
      list = list.filter((p) => (p.category ?? 'Uncategorized') === category);
    }
    return list;
  }, [products, category]);

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
          {search ? 'No products match your search.' : 'No products in this category.'}
        </p>
        {search && (
          <button
            type="button"
            onClick={onClearSearch}
            className="text-primary-600 font-medium hover:underline"
          >
            Clear search
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4">
      {categories.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((p) => (
          <POSProductCard key={p.id} product={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
