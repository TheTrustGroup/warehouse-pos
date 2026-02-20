// ============================================================
// InventoryPage.tsx  —  warehouse-pos/src/pages/InventoryPage.tsx
//
// DELETE FIX SUMMARY:
// Root cause of the revert bug:
//   1. User taps Delete
//   2. Optimistic update removes product from state
//   3. Background poll fires, re-fetches all products from API,
//      OVERWRITES state — deleted product comes back ("revert")
//   4. DELETE response finally arrives — too late, UI shows old data
//
// Fix: pendingDeletesRef — a Set of product IDs currently being deleted.
//   - Added to BEFORE the optimistic remove
//   - Poll's setProducts call filters out anything in this set
//   - Cleared on confirmed success OR reverted on hard failure
//   - Even if 3 polls fire mid-delete, the product stays gone from UI
//
// SPEED improvements:
//   - Optimistic updates for add/edit/delete — zero wait for UI
//   - Poll only runs when tab is visible (visibilitychange)
//   - Modal pauses poll (no wasted fetches mid-edit)
//   - apiFetch uses AbortController timeout (8s hard limit)
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import ProductCard, { ProductCardSkeleton, type Product } from '../components/inventory/ProductCard';
import ProductModal from '../components/inventory/ProductModal';
import { type SizeCode } from '../components/inventory/SizesSection';
import { getApiHeaders } from '../lib/api';

type FilterKey = 'all' | string;
type SortKey   = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

interface InventoryPageProps { apiBaseUrl?: string; }

const POLL_MS   = 30_000;
const CATEGORIES = ['Sneakers', 'Slippers', 'Boots', 'Sandals', 'Accessories'];
const WAREHOUSES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town' },
];

// ── Icons ──────────────────────────────────────────────────────────────────

const IconSearch = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconX      = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconPlus   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IconRefresh = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconBox    = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;

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
    error:   'border-l-red-500',
    info:    'border-l-blue-500',
  };
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`
          flex items-center gap-2.5 px-4 py-3 rounded-xl
          bg-slate-900 text-white text-[14px] font-medium
          shadow-[0_8px_24px_rgba(0,0,0,0.2)]
          border-l-4 ${colors[t.type]}
          min-w-[220px] max-w-[320px]
          animate-[toastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
        `}>{t.message}</div>
      ))}
    </div>
  );
}

// ── Filters + sort ─────────────────────────────────────────────────────────

function applyFilters(products: Product[], search: string, category: FilterKey, sort: SortKey): Product[] {
  let r = [...products];
  if (search.trim()) {
    const q = search.toLowerCase();
    r = r.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p as Product & { barcode?: string }).barcode?.toLowerCase().includes(q)
    );
  }
  if (category !== 'all') r = r.filter(p => p.category.toLowerCase() === category.toLowerCase());
  r.sort((a, b) => {
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
  return r;
}

// ── Confirmation dialog ────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  product,
  onConfirm,
  onCancel,
}: {
  product: Product;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} aria-hidden />

      {/* Dialog */}
      <div className="
        fixed bottom-0 left-0 right-0 z-50
        bg-white rounded-t-[24px]
        shadow-[0_-8px_40px_rgba(0,0,0,0.12)]
        px-5 pt-5 pb-8
        animate-[sheetUp_0.28s_cubic-bezier(0.34,1.1,0.64,1)]
      ">
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5"/>

        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <p className="text-[16px] font-bold text-slate-900">Delete product?</p>
            <p className="text-[13px] text-slate-500 mt-1 leading-snug">
              <span className="font-semibold text-slate-700">{product.name}</span> will be permanently removed from this warehouse. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="
              flex-1 h-13 rounded-2xl border-[1.5px] border-slate-200
              bg-white text-[15px] font-bold text-slate-600
              hover:bg-slate-50 active:scale-[0.98]
              transition-all duration-150
            "
            style={{ height: '52px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="
              flex-1 h-13 rounded-2xl border-none
              bg-red-500 hover:bg-red-600
              text-[15px] font-bold text-white
              active:scale-[0.98]
              transition-all duration-150
              shadow-[0_4px_12px_rgba(239,68,68,0.3)]
            "
            style={{ height: '52px' }}
          >
            Delete
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage({ apiBaseUrl = '' }: InventoryPageProps) {

  // Data
  const [products, setProducts]     = useState<Product[]>([]);
  const [sizeCodes, setSizeCodes]   = useState<SizeCode[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // Warehouse
  const [warehouseId, setWarehouseId]           = useState(WAREHOUSES[0].id);
  const [warehouseDropdownOpen, setWhDropdown]  = useState(false);
  const currentWarehouse = WAREHOUSES.find(w => w.id === warehouseId) ?? WAREHOUSES[0];

  // Filters
  const [search, setSearch]     = useState('');
  const [category, setCategory] = useState<FilterKey>('all');
  const [sort, setSort]         = useState<SortKey>('name_asc');
  const [sortOpen, setSortOpen] = useState(false);

  // Card inline edit
  const [activeEditId, setActiveEditId] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen]         = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Delete confirm dialog
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  // Refs
  const modalOpenRef      = useRef(false);
  const pollTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // THE DELETE FIX: pendingDeletesRef
  //
  // Why a ref and not state?
  //   - State updates are async — there's a window between setState and the
  //     re-render where a poll could fire and not see the pending set.
  //   - Refs update synchronously. The value is correct the instant we write it.
  //   - We don't need the UI to re-render when this set changes — we only need
  //     setProducts (which does re-render) to filter against it.
  // ─────────────────────────────────────────────────────────────────────────
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const { toasts, show: showToast } = useToast();

  // ── apiFetch ──────────────────────────────────────────────────────────────
  // Adds 8s timeout so slow API calls don't hang the UI forever.

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const res = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: new Headers({
          ...getApiHeaders(),
          ...(init?.headers ?? {}),
        }),
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string; error?: string };
        const msg = body?.message ?? body?.error ?? `Request failed: ${res.status}`;
        const e = new Error(msg) as Error & { status: number };
        e.status = res.status;
        throw e;
      }
      // 204 No Content has no body — do not call res.json()
      if (res.status === 204) return undefined as T;
      return res.json();
    } catch (e: unknown) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timed out — check your connection');
      throw e;
    }
  }

  // ── Load products ─────────────────────────────────────────────────────────
  // silent=true → don't show loading spinner (used by poll + post-action refresh)

  const loadProducts = useCallback(async (silent = false) => {
    // Never overwrite modal form state mid-edit
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

      // ─────────────────────────────────────────────────────────────────────
      // KEY: filter out any IDs currently being deleted.
      // Without this, the poll overwrites state and the product "comes back".
      // ─────────────────────────────────────────────────────────────────────
      const pending = pendingDeletesRef.current;
      setProducts(
        pending.size > 0
          ? list.filter(p => !pending.has(p.id))
          : list
      );
    } catch (e: unknown) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to load products.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [warehouseId, apiBaseUrl]);

  // ── Load size codes ───────────────────────────────────────────────────────

  const loadSizeCodes = useCallback(async () => {
    try {
      const data = await apiFetch<SizeCode[] | { data: SizeCode[] }>(
        `/api/size-codes?warehouse_id=${encodeURIComponent(warehouseId)}`
      );
      setSizeCodes(Array.isArray(data) ? data : (data as { data?: SizeCode[] }).data ?? []);
    } catch { /* non-critical */ }
  }, [warehouseId]);

  // ── Polling ───────────────────────────────────────────────────────────────

  function startPoll() {
    stopPoll();
    pollTimerRef.current = setInterval(() => {
      if (!modalOpenRef.current && document.visibilityState === 'visible') {
        loadProducts(true);
      }
    }, POLL_MS);
  }

  function stopPoll() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    loadProducts();
    loadSizeCodes();
    startPoll();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !modalOpenRef.current) {
        loadProducts(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopPoll(); document.removeEventListener('visibilitychange', onVisible); };
  }, [warehouseId]);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openAddModal() { setEditingProduct(null); setModalOpen(true); }
  function openEditModal(p: Product) { setEditingProduct(structuredClone(p)); setModalOpen(true); }
  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    setTimeout(() => loadProducts(true), 300);
  }

  // ── DELETE — the fixed version ────────────────────────────────────────────
  //
  // Flow:
  //   1. User taps delete icon → confirm dialog appears (no API call yet)
  //   2. User taps "Delete" in dialog
  //   3. Add product ID to pendingDeletesRef  ← SYNC, instant
  //   4. Remove from products state           ← optimistic, instant
  //   5. Send DELETE to API
  //   6a. Success → remove from pendingDeletes. Done. Product is gone.
  //   6b. Failure → remove from pendingDeletes, put product back, show error.
  //
  // Why step 3 must come BEFORE step 4:
  //   If setProducts fires a re-render and a poll timer fires in the same tick,
  //   the poll's loadProducts call reads pendingDeletesRef synchronously.
  //   Because we added to the ref first, the poll will filter out the product
  //   even if the DELETE hasn't completed yet.

  function handleDeleteRequest(product: Product) {
    setConfirmDelete(product);
  }

  async function executeDelete(product: Product) {
    setConfirmDelete(null); // close dialog immediately

    // Step 3: mark pending SYNCHRONOUSLY before any state update
    pendingDeletesRef.current.add(product.id);

    // Step 4: optimistic remove from UI
    setProducts(prev => prev.filter(p => p.id !== product.id));

    // Step 5: API call — try admin path first (matches rest of app), then public API on 404
    try {
      try {
        await apiFetch(
          `/admin/api/products/${encodeURIComponent(product.id)}?warehouse_id=${encodeURIComponent(warehouseId)}`,
          { method: 'DELETE' }
        );
      } catch (adminErr: unknown) {
        const status = (adminErr as { status?: number })?.status;
        if (status === 404) {
          await apiFetch(`/api/products/${encodeURIComponent(product.id)}`, {
            method: 'DELETE',
            body: JSON.stringify({ warehouseId }),
          });
        } else {
          throw adminErr;
        }
      }

      // Step 6a: Confirmed. Clear pending. Product is gone permanently.
      pendingDeletesRef.current.delete(product.id);
      showToast(`"${product.name}" deleted`, 'success');

    } catch (e: unknown) {
      // Step 6b: Failed. Revert everything.
      pendingDeletesRef.current.delete(product.id);

      // Re-insert the product back into the list, sorted by name
      setProducts(prev => {
        const already = prev.find(p => p.id === product.id);
        if (already) return prev; // guard against double-insert
        return [...prev, product].sort((a, b) => a.name.localeCompare(b.name));
      });

      const msg = e instanceof Error ? e.message : 'Failed to delete product';
      showToast(msg, 'error');
    }
  }

  // ── Submit (add / edit) ───────────────────────────────────────────────────

  async function handleSubmit(payload: Omit<Product, 'id'> & { id?: string }, isEdit: boolean) {
    if (isEdit && payload.id) {
      const original = products.find(p => p.id === payload.id);

      // Optimistic update
      setProducts(prev => prev.map(p => p.id === payload.id ? { ...p, ...payload } as Product : p));

      try {
        await apiFetch(`/api/products/${payload.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, warehouseId }),
        });
        showToast(`${payload.name} updated`, 'success');
      } catch (e: unknown) {
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

  // ── Stock save ────────────────────────────────────────────────────────────

  async function handleSaveStock(
    id: string,
    update: { quantity: number; quantityBySize: Product['quantityBySize']; sizeKind: string }
  ) {
    const original = products.find(p => p.id === id);

    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...update } as Product : p));
    setActiveEditId(null);

    try {
      await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...update, warehouseId }),
      });
      showToast('Stock updated', 'success');
    } catch (e: unknown) {
      if (original) setProducts(prev => prev.map(p => p.id === id ? original : p));
      showToast(e instanceof Error ? e.message : 'Failed to update stock.', 'error');
      throw e;
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayed = applyFilters(products, search, category, sort);
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name_asc',   label: 'Name A–Z'        },
    { key: 'name_desc',  label: 'Name Z–A'        },
    { key: 'price_asc',  label: 'Price low–high'  },
    { key: 'price_desc', label: 'Price high–low'  },
    { key: 'stock_asc',  label: 'Stock low–high'  },
    { key: 'stock_desc', label: 'Stock high–low'  },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 pb-24">

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-[20px] font-bold text-slate-900 leading-tight">Inventory</h1>
            {/* Warehouse selector */}
            <div className="relative mt-0.5">
              <button type="button"
                      onClick={() => setWhDropdown(o => !o)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                {currentWarehouse.name}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {warehouseDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWhDropdown(false)} aria-hidden />
                  <div className="absolute left-0 top-6 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-40">
                    {WAREHOUSES.map(w => (
                      <button key={w.id} type="button"
                              onClick={() => { setWarehouseId(w.id); setActiveEditId(null); setWhDropdown(false); }}
                              className={`w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors
                                ${warehouseId === w.id ? 'text-red-500 bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                        {warehouseId === w.id && <span className="mr-1.5">✓</span>}
                        {w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => loadProducts()}
                    className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors"
                    aria-label="Refresh">
              <IconRefresh/>
            </button>
            <button type="button" onClick={openAddModal}
                    className="h-10 px-4 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[14px] font-semibold flex items-center gap-1.5 transition-colors active:scale-[0.97]">
              <IconPlus/> Add
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"><IconSearch/></span>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                   placeholder="Search products, SKU, or barcode…"
                   className="w-full h-11 pl-10 pr-10 rounded-xl border-[1.5px] border-slate-200 bg-slate-50
                              text-[14px] text-slate-900 placeholder:text-slate-300
                              focus:outline-none focus:border-red-400 focus:bg-white focus:ring-[3px] focus:ring-red-100
                              transition-all duration-150"/>
            {search && (
              <button onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <IconX/>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Category chips ── */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none">
        {['all', ...CATEGORIES].map(cat => (
          <button key={cat} type="button" onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold
                              border-[1.5px] transition-all duration-150 whitespace-nowrap
                              ${category === cat
                                ? 'bg-red-500 border-red-500 text-white'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}>
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* ── Results + sort ── */}
      <div className="flex items-center justify-between px-4 pb-3">
        <p className="text-[12px] font-medium text-slate-400">
          {loading ? 'Loading…' : `${displayed.length} product${displayed.length !== 1 ? 's' : ''}`}
        </p>
        <div className="relative">
          <button type="button" onClick={() => setSortOpen(o => !o)}
                  className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
            {SORT_OPTIONS.find(o => o.key === sort)?.label ?? 'Sort'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} aria-hidden />
              <div className="absolute right-0 top-7 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-44">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key} type="button"
                          onClick={() => { setSort(opt.key); setSortOpen(false); }}
                          className={`w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors
                            ${sort === opt.key ? 'text-red-500 bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="px-4">

        {error && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-400"><IconBox/></div>
            <p className="text-[15px] font-semibold text-slate-700">Couldn't load products</p>
            <p className="text-[13px] text-slate-400">{error}</p>
            <button type="button" onClick={() => loadProducts()}
                    className="h-10 px-5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors">
              Retry
            </button>
          </div>
        )}

        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i}/>)}
          </div>
        )}

        {!loading && !error && products.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300"><IconBox/></div>
            <div>
              <p className="text-[17px] font-bold text-slate-700 mb-1">No products yet</p>
              <p className="text-[14px] text-slate-400">Add your first product to get started.</p>
            </div>
            <button type="button" onClick={openAddModal}
                    className="h-12 px-6 rounded-xl bg-red-500 text-white text-[14px] font-semibold flex items-center gap-2 hover:bg-red-600 transition-colors">
              <IconPlus/> Add first product
            </button>
          </div>
        )}

        {!loading && !error && products.length > 0 && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"><IconSearch/></div>
            <p className="text-[15px] font-semibold text-slate-700">No results for &quot;{search || category}&quot;</p>
            <button type="button" onClick={() => { setSearch(''); setCategory('all'); }}
                    className="text-[13px] font-semibold text-red-500 hover:text-red-600">
              Clear filters
            </button>
          </div>
        )}

        {!loading && !error && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                isEditing={activeEditId === product.id}
                onEditOpen={id => { setActiveEditId(id); if (modalOpen) closeModal(); }}
                onEditClose={() => setActiveEditId(null)}
                onSaveStock={handleSaveStock}
                onEditFull={openEditModal}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Modal ── */}
      <ProductModal
        isOpen={modalOpen}
        product={editingProduct}
        sizeCodes={sizeCodes}
        warehouseId={warehouseId}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {/* ── Confirm delete dialog ── */}
      {confirmDelete && (
        <ConfirmDeleteDialog
          product={confirmDelete}
          onConfirm={() => executeDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* ── Toasts ── */}
      <ToastContainer toasts={toasts}/>

      <style>{`
        @keyframes toastIn {
          from { opacity:0; transform:translateY(12px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
