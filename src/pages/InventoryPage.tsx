// ============================================================
// InventoryPage.tsx
// File: warehouse-pos/src/pages/InventoryPage.tsx
//
// Final assembly. Owns all state:
// - products list (from API)
// - search + filter
// - which card is inline-editing
// - modal open/closed + which product is being edited
//
// Rules:
// - editingProduct is a deep clone — polling never mutates it
// - poll is paused while modal is open
// - optimistic updates: update UI immediately, revert on error
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import ProductCard, { ProductCardSkeleton, type Product } from '../components/inventory/ProductCard';
import ProductModal from '../components/inventory/ProductModal';
import { type SizeCode } from '../components/inventory/SizesSection';

// ── Types ──────────────────────────────────────────────────────────────────

type FilterKey = 'all' | string;
type SortKey = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

interface InventoryPageProps {
  warehouseId?: string;
  apiBaseUrl?: string;
  authToken?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000;
const CATEGORIES = ['Sneakers', 'Slippers', 'Boots', 'Sandals', 'Accessories'];

// ── Icons ──────────────────────────────────────────────────────────────────

const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconBell = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconChevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconBox = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ── Toast ──────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: string; message: string; type: ToastType; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  const colors: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error: 'border-l-red-500',
    info: 'border-l-blue-500',
  };
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`
            flex items-center gap-2.5 px-4 py-3 rounded-xl
            bg-slate-900 text-white text-[14px] font-medium
            shadow-[0_8px_24px_rgba(0,0,0,0.2)]
            border-l-4 ${colors[t.type]}
            min-w-[220px] max-w-[320px]
            animate-[toastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
          `}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Sort + filter helpers ──────────────────────────────────────────────────

function applyFilters(
  products: Product[],
  search: string,
  category: FilterKey,
  sort: SortKey
): Product[] {
  let result = [...products];

  // Search
  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p as Product & { barcode?: string }).barcode?.toLowerCase().includes(q)
    );
  }

  // Category
  if (category !== 'all') {
    result = result.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }

  // Sort
  result.sort((a, b) => {
    switch (sort) {
      case 'name_asc':   return a.name.localeCompare(b.name);
      case 'name_desc':  return b.name.localeCompare(a.name);
      case 'price_asc':  return a.sellingPrice - b.sellingPrice;
      case 'price_desc': return b.sellingPrice - a.sellingPrice;
      case 'stock_asc':  return a.quantity - b.quantity;
      case 'stock_desc': return b.quantity - a.quantity;
      default:           return 0;
    }
  });

  return result;
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage({
  warehouseId = '00000000-0000-0000-0000-000000000001',
  apiBaseUrl = '',
  authToken = '',
}: InventoryPageProps) {

  // ── Data state ───────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [sizeCodes, setSizeCodes] = useState<SizeCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);

  // ── Modal state ──────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const modalOpenRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toasts, show: showToast } = useToast();

  // ── API helpers ──────────────────────────────────────────────────────────

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
  };

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBaseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error((body as { message?: string }).message ?? `Request failed: ${res.status}`) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // ── Load products ────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (silent = false) => {
    // Never overwrite modal state mid-edit
    if (modalOpenRef.current) return;

    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ data?: Product[]; products?: Product[] } | Product[]>(
        `/api/products?warehouse_id=${encodeURIComponent(warehouseId)}&limit=1000`
      );
      const list: Product[] = Array.isArray(data)
        ? data
        : (data as { data?: Product[] }).data ?? (data as { products?: Product[] }).products ?? [];
      setProducts(list);
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load products.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [warehouseId, apiBaseUrl, authToken]);

  // ── Load size codes ──────────────────────────────────────────────────────

  const loadSizeCodes = useCallback(async () => {
    try {
      const data = await apiFetch<SizeCode[] | { data: SizeCode[] }>(
        `/api/size-codes?warehouse_id=${encodeURIComponent(warehouseId)}`
      );
      setSizeCodes(Array.isArray(data) ? data : (data as { data?: SizeCode[] }).data ?? []);
    } catch {
      // Non-critical — autocomplete just won't have suggestions
    }
  }, [warehouseId, apiBaseUrl, authToken]);

  // ── Polling ──────────────────────────────────────────────────────────────

  function startPoll() {
    stopPoll();
    pollTimerRef.current = setInterval(() => {
      if (!modalOpenRef.current && document.visibilityState === 'visible') {
        loadProducts(true);
      }
    }, POLL_INTERVAL);
  }

  function stopPoll() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    loadProducts();
    loadSizeCodes();
    startPoll();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !modalOpenRef.current) {
        loadProducts(true);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopPoll();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync ref with modal state so poll check is always current
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  // ── Modal handlers ───────────────────────────────────────────────────────

  function openAddModal() {
    setEditingProduct(null);
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    // Deep clone so polling never mutates the form's product reference
    setEditingProduct(structuredClone(product));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    // Refresh after close to pick up any changes
    setTimeout(() => loadProducts(true), 300);
  }

  // ── Submit handler ───────────────────────────────────────────────────────

  async function handleSubmit(
    payload: Omit<Product, 'id'> & { id?: string },
    isEdit: boolean
  ) {
    if (isEdit && payload.id) {
      // Optimistic update
      const original = products.find(p => p.id === payload.id);
      setProducts(prev =>
        prev.map(p => p.id === payload.id ? { ...p, ...payload } as Product : p)
      );
      try {
        await apiFetch(`/api/products/${payload.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, warehouseId }),
        });
        showToast(`${payload.name} updated`, 'success');
      } catch (e: unknown) {
        // Revert optimistic update
        if (original) setProducts(prev => prev.map(p => p.id === payload.id ? original : p));
        showToast(e instanceof Error ? e.message : 'Failed to update product.', 'error');
        throw e;
      }
    } else {
      try {
        const created = await apiFetch<Product>('/api/products', {
          method: 'POST',
          body: JSON.stringify({ ...payload, warehouseId }),
        });
        setProducts(prev => [created, ...prev]);
        showToast(`${payload.name} added`, 'success');
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : 'Failed to add product.', 'error');
        throw e;
      }
    }
  }

  // ── Stock save handler ───────────────────────────────────────────────────

  async function handleSaveStock(
    id: string,
    update: { quantity: number; quantityBySize: Product['quantityBySize']; sizeKind: string }
  ) {
    const original = products.find(p => p.id === id);

    // Optimistic update
    setProducts(prev =>
      prev.map(p => p.id === id ? { ...p, ...update } as Product : p)
    );
    setActiveEditId(null);

    try {
      await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...update, warehouseId }),
      });
      showToast('Stock updated', 'success');
    } catch (e: unknown) {
      // Revert
      if (original) setProducts(prev => prev.map(p => p.id === id ? original : p));
      showToast(e instanceof Error ? e.message : 'Failed to update stock.', 'error');
      throw e;
    }
  }

  // ── Filtered + sorted products ───────────────────────────────────────────

  const displayed = applyFilters(products, search, category, sort);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name_asc',   label: 'Name A–Z' },
    { key: 'name_desc',  label: 'Name Z–A' },
    { key: 'price_asc',  label: 'Price low–high' },
    { key: 'price_desc', label: 'Price high–low' },
    { key: 'stock_asc',  label: 'Stock low–high' },
    { key: 'stock_desc', label: 'Stock high–low' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 pb-24">

      {/* ── Page header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-[20px] font-bold text-slate-900 leading-tight">Inventory</h1>
            <p className="text-[12px] text-slate-400 font-medium mt-0.5">Main Store</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadProducts()}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors"
              aria-label="Refresh"
            >
              <IconRefresh />
            </button>
            <button
              type="button"
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors relative"
              aria-label="Notifications"
            >
              <IconBell />
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="h-10 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold flex items-center gap-1.5 transition-colors active:scale-[0.97]"
            >
              <IconPlus /> Add
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <IconSearch />
            </span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products, SKU, or barcode…"
              className="
                w-full h-11 pl-10 pr-10 rounded-xl
                border-[1.5px] border-slate-200 bg-slate-50
                text-[14px] text-slate-900
                placeholder:text-slate-300
                focus:outline-none focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
                transition-all duration-150
              "
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <IconX />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Category filter chips ── */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
        {['all', ...CATEGORIES].map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`
              flex-shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold
              border-[1.5px] transition-all duration-150 whitespace-nowrap
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

      {/* ── Results meta + sort ── */}
      <div className="flex items-center justify-between px-4 pb-3">
        <p className="text-[12px] font-medium text-slate-400">
          {loading ? 'Loading…' : `${displayed.length} product${displayed.length !== 1 ? 's' : ''}`}
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen(o => !o)}
            className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
          >
            {SORT_OPTIONS.find(o => o.key === sort)?.label ?? 'Sort'}
            <IconChevron />
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} aria-hidden />
              <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-44">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSort(opt.key); setSortOpen(false); }}
                    className={`
                      w-full px-4 py-2.5 text-left text-[13px] font-medium
                      transition-colors
                      ${sort === opt.key
                        ? 'text-red-500 bg-red-50'
                        : 'text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <main className="px-4">

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-400">
              <IconBox />
            </div>
            <p className="text-[15px] font-semibold text-slate-700">Couldn't load products</p>
            <p className="text-[13px] text-slate-400">{error}</p>
            <button
              type="button"
              onClick={() => loadProducts()}
              className="h-10 px-5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Empty — no products at all */}
        {!loading && !error && products.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
              <IconBox />
            </div>
            <div>
              <p className="text-[17px] font-bold text-slate-700 mb-1">No products yet</p>
              <p className="text-[14px] text-slate-400">Add your first product to get started.</p>
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="h-12 px-6 rounded-xl bg-red-500 text-white text-[14px] font-semibold flex items-center gap-2 hover:bg-red-600 transition-colors"
            >
              <IconPlus /> Add first product
            </button>
          </div>
        )}

        {/* Empty search/filter */}
        {!loading && !error && products.length > 0 && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <IconSearch />
            </div>
            <p className="text-[15px] font-semibold text-slate-700">
              No results for &quot;{search || category}&quot;
            </p>
            <button
              type="button"
              onClick={() => { setSearch(''); setCategory('all'); }}
              className="text-[13px] font-semibold text-red-500 hover:text-red-600"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Product grid */}
        {!loading && !error && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isEditing={activeEditId === product.id}
                onEditOpen={id => {
                  setActiveEditId(id);
                  // Close any open modal
                  if (modalOpen) closeModal();
                }}
                onEditClose={() => setActiveEditId(null)}
                onSaveStock={handleSaveStock}
                onEditFull={openEditModal}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Product Modal ── */}
      <ProductModal
        isOpen={modalOpen}
        product={editingProduct}
        sizeCodes={sizeCodes}
        warehouseId={warehouseId}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts} />

      {/* Keyframes */}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
