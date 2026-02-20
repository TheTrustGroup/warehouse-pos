// ============================================================
// ProductGrid.tsx
// File: warehouse-pos/src/components/pos/ProductGrid.tsx
//
// Renders the filtered + searched product grid.
// Handles: loading skeletons, empty search, empty category,
// zero products in warehouse.
// ============================================================

import POSProductCard, { POSProductCardSkeleton } from './POSProductCard';
import { type POSProduct } from './SizePickerSheet';

// ── Types ──────────────────────────────────────────────────────────────────

type FilterCategory = 'all' | string;

interface ProductGridProps {
  products: POSProduct[];
  loading: boolean;
  search: string;
  category: FilterCategory;
  onSelect: (product: POSProduct) => void;
  onClearSearch: () => void;
  onCategoryChange: (cat: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Sneakers', 'Slippers', 'Boots', 'Sandals', 'Accessories'];

function filterProducts(
  products: POSProduct[],
  search: string,
  category: FilterCategory
): POSProduct[] {
  let result = [...products];

  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }

  if (category !== 'all') {
    result = result.filter(
      p => p.category.toLowerCase() === category.toLowerCase()
    );
  }

  // In-stock first, then alphabetical
  result.sort((a, b) => {
    if (a.quantity === 0 && b.quantity > 0) return 1;
    if (b.quantity === 0 && a.quantity > 0) return -1;
    return a.name.localeCompare(b.name);
  });

  return result;
}

// ── Empty States ───────────────────────────────────────────────────────────

function EmptySearch({ search, onClear }: { search: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
      <div className="
        w-14 h-14 rounded-2xl bg-slate-100
        flex items-center justify-center text-slate-300
      ">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-bold text-slate-700 mb-1">
          No results for &quot;{search}&quot;
        </p>
        <p className="text-[13px] text-slate-400">
          Try a different name, SKU, or barcode
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="
          h-9 px-4 rounded-xl
          bg-slate-100 hover:bg-slate-200
          text-[13px] font-semibold text-slate-600
          transition-colors duration-150
        "
      >
        Clear search
      </button>
    </div>
  );
}

function EmptyCategory({ category }: { category: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center px-8">
      <div className="
        w-14 h-14 rounded-2xl bg-slate-100
        flex items-center justify-center text-slate-300
      ">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
      </div>
      <div>
        <p className="text-[15px] font-bold text-slate-700 mb-1">
          No {category} in stock
        </p>
        <p className="text-[13px] text-slate-400">
          Add stock from the Inventory page
        </p>
      </div>
    </div>
  );
}

function EmptyWarehouse() {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center px-8">
      <div className="
        w-16 h-16 rounded-2xl bg-slate-100
        flex items-center justify-center text-slate-300
      ">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
          <line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
      </div>
      <div>
        <p className="text-[17px] font-bold text-slate-700 mb-1">
          No products in this warehouse
        </p>
        <p className="text-[14px] text-slate-400 leading-relaxed">
          Go to Inventory to add stock to this location
        </p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function ProductGrid({
  products,
  loading,
  search,
  category,
  onSelect,
  onClearSearch,
  onCategoryChange,
}: ProductGridProps) {

  // ── Loading skeletons ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <POSProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // ── No products at all ────────────────────────────────────────────────────
  if (products.length === 0) {
    return <EmptyWarehouse />;
  }

  const filtered = filterProducts(products, search, category);

  // ── No search results ─────────────────────────────────────────────────────
  if (filtered.length === 0 && search.trim()) {
    return <EmptySearch search={search} onClear={onClearSearch} />;
  }

  // ── Empty category ────────────────────────────────────────────────────────
  if (filtered.length === 0 && category !== 'all') {
    return <EmptyCategory category={category} />;
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 pb-28">

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-none">
        {['all', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => onCategoryChange(cat)}
            className={`
              flex-shrink-0 h-8 px-3.5 rounded-full
              text-[12px] font-semibold whitespace-nowrap
              border-[1.5px] transition-all duration-150
              ${category === cat
                ? 'bg-red-500 border-red-500 text-white'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }
            `}
          >
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
        {filtered.length} product{filtered.length !== 1 ? 's' : ''}
        {search ? ` for "${search}"` : ''}
      </p>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filtered.map(product => (
          <POSProductCard
            key={product.id}
            product={product}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
