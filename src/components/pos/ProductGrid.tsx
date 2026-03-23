import { useEffect, useMemo, useState } from 'react';
import { ProductCardSkeleton } from '../inventory/ProductCard';
import POSProductCard from './POSProductCard';
import type { POSProduct } from './SizePickerSheet';

export type { POSProduct };

/** Color options for filter dropdown — match Inventory. */
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

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function compactSearchText(value: string | null | undefined): string {
  return normalizeSearchText(value).replace(/[^a-z0-9]/g, '');
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
    if (haystack[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}

function scoreMatch(
  product: POSProduct,
  q: string,
  compactQ: string,
  tokens: string[],
  meta: { blob: string; compact: string }
): number {
  const name = normalizeSearchText(product.name);
  const sku = normalizeSearchText(product.sku ?? '');
  const barcode = normalizeSearchText(product.barcode ?? '');
  const skuCompact = compactSearchText(product.sku ?? '');
  const barcodeCompact = compactSearchText(product.barcode ?? '');

  let score = 0;

  // Highest confidence: exact identifier hits.
  if (compactQ && barcodeCompact === compactQ) score += 1000;
  if (compactQ && skuCompact === compactQ) score += 900;
  if (q && name === q) score += 850;

  // Strong confidence: prefix hits.
  if (q && name.startsWith(q)) score += 700;
  if (q && sku.startsWith(q)) score += 650;
  if (q && barcode.startsWith(q)) score += 650;

  // Medium confidence: contains hits.
  if (q && name.includes(q)) score += 450;
  if (q && sku.includes(q)) score += 400;
  if (q && barcode.includes(q)) score += 400;

  // Compact contains helps spacing/punctuation variants.
  if (compactQ && meta.compact.includes(compactQ)) score += 250;

  // Reward complete token coverage.
  const tokenHits = tokens.reduce((acc, t) => (meta.blob.includes(t) ? acc + 1 : acc), 0);
  score += tokenHits * 80;

  // Small boost for short fuzzy subsequence hints.
  if (
    compactQ &&
    compactQ.length >= 3 &&
    compactQ.length <= 7 &&
    tokens.length <= 2 &&
    isSubsequence(compactQ, meta.compact)
  ) {
    score += 120;
  }

  // Tie-breaker: earlier name match is slightly better.
  if (q) {
    const idx = name.indexOf(q);
    if (idx >= 0) score += Math.max(0, 40 - idx);
  }

  // Final deterministic tie-breaker: alphabetical by name.
  return score;
}

function applyFilters(
  list: POSProduct[],
  search: string,
  category: string,
  sizeFilter: string,
  colorFilter: string,
  searchableMeta: Map<string, { blob: string; compact: string }>
): POSProduct[] {
  let r = [...list];
  if (search.trim()) {
    const q = normalizeSearchText(search);
    const compactQ = compactSearchText(search);
    const tokens = q.split(' ').filter(Boolean);
    const matched = r.filter((p) => {
      const meta = searchableMeta.get(p.id);
      if (!meta) return false;
      if (meta.blob.includes(q)) return true;
      if (compactQ && meta.compact.includes(compactQ)) return true;
      // Subsequence matching is only for "hint" queries; keep strict bounds to avoid noisy matches.
      if (
        compactQ &&
        compactQ.length >= 3 &&
        compactQ.length <= 7 &&
        tokens.length <= 2 &&
        isSubsequence(compactQ, meta.compact)
      ) {
        return true;
      }
      return tokens.every((t) => meta.blob.includes(t));
    });
    r = matched
      .map((p) => {
        const meta = searchableMeta.get(p.id)!;
        return { p, score: scoreMatch(p, q, compactQ, tokens, meta) };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.p.name.localeCompare(b.p.name);
      })
      .map((entry) => entry.p);
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
  const [showAllSearchResults, setShowAllSearchResults] = useState(false);
  const SEARCH_RENDER_LIMIT = 60;

  const searchableMeta = useMemo(() => {
    const map = new Map<string, { blob: string; compact: string }>();
    for (const p of products) {
      const sizeCodes = (p.quantityBySize ?? []).map((s) => s.sizeCode ?? '').join(' ');
      const raw = [
        p.name,
        p.sku,
        p.barcode ?? '',
        p.category ?? '',
        p.color ?? '',
        sizeCodes,
      ]
        .join(' ')
        .trim();
      map.set(p.id, {
        blob: normalizeSearchText(raw),
        compact: compactSearchText(raw),
      });
    }
    return map;
  }, [products]);

  const categories = useMemo(() => {
    const set = new Set<string>(['all']);
    products.forEach((p) => (p.category ? set.add(p.category) : set.add('Uncategorized')));
    return Array.from(set).sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)));
  }, [products]);

  const uniqueSizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.sizeKind === 'na') set.add('NA');
      else if (p.sizeKind === 'one_size') set.add('One size');
      else for (const s of p.quantityBySize ?? []) if (s.sizeCode) set.add(s.sizeCode);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filtered = useMemo(
    () => applyFilters(products, search, category, sizeFilter, colorFilter, searchableMeta),
    [products, search, category, sizeFilter, colorFilter, searchableMeta]
  );

  // Reset to limited mode whenever search text changes.
  useEffect(() => {
    setShowAllSearchResults(false);
  }, [search]);

  const isSearchActive = Boolean(search.trim());
  const shouldLimitRenderedSearchResults =
    isSearchActive && !showAllSearchResults && filtered.length > SEARCH_RENDER_LIMIT;
  const visibleProducts = shouldLimitRenderedSearchResults
    ? filtered.slice(0, SEARCH_RENDER_LIMIT)
    : filtered;

  const hasActiveFilters = Boolean(search.trim() || (category && category !== 'all') || sizeFilter.trim() || colorFilter.trim());

  const handleClearFilters = () => {
    onClearSearch();
    onCategoryChange('all');
    onSizeFilterChange('');
    onColorFilterChange('');
  };

  if (loading) {
    return (
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
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

      {/* Size and Color filters + results count — same as Inventory */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sizeFilter}
          onChange={(e) => onSizeFilterChange(e.target.value)}
          className="h-[30px] pl-2.5 pr-6 rounded-[20px] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] min-w-[100px] cursor-pointer appearance-none bg-no-repeat bg-[length:10px_6px] bg-[right_10px_center]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238A8784' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")` }}
          aria-label="Filter by size"
        >
          <option value="">Size: All</option>
          {uniqueSizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={colorFilter}
          onChange={(e) => onColorFilterChange(e.target.value)}
          className="h-[30px] pl-2.5 pr-6 rounded-[20px] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] min-w-[100px] cursor-pointer appearance-none bg-no-repeat bg-[length:10px_6px] bg-[right_10px_center]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238A8784' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")` }}
          aria-label="Filter by color"
        >
          <option value="">Color: All</option>
          {COLOR_OPTIONS.filter((c) => c !== 'All').map((c) => (
            <option key={c} value={c === 'Uncategorized' ? 'uncategorized' : c}>{c}</option>
          ))}
        </select>
        <span className="text-[11px] text-[var(--edk-ink-3)] whitespace-nowrap">
          Showing{' '}
          <strong className="text-[var(--edk-ink-2)] font-semibold">{visibleProducts.length}</strong>
          {' '}of {filtered.length}
          {isSearchActive ? ' matches' : ''} ({products.length} total)
        </span>
        {shouldLimitRenderedSearchResults && (
          <button
            type="button"
            onClick={() => setShowAllSearchResults(true)}
            className="h-[30px] px-3 rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)]"
          >
            Show all ({filtered.length})
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {visibleProducts.map((p) => (
          <POSProductCard key={p.id} product={p} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
