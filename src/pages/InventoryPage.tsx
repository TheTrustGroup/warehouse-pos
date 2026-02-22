// ============================================================
// InventoryPage.tsx
// File: warehouse-pos/src/pages/InventoryPage.tsx
//
// FIXES IN THIS VERSION:
//
// 1. ROOT CAUSE OF "0 products":
//    apiFetch now uses API_BASE_URL from lib/api.ts directly.
//    No longer relies on apiBaseUrl prop being passed correctly.
//    `https://warehouse-pos-api-v2.vercel.app` is baked in via
//    the api.ts lib — so the fetch always goes to the right host.
//
// 2. POST /api/products (new product sync):
//    - API returns bare product object (camelCase, confirmed from logs)
//    - Handles { data: {...} } wrapper AND bare object
//    - Product appears in list immediately with correct id/sizes
//    - Falls back to silent reload if response is unexpected
//
// 3. PUT /api/products/:id (edit sync):
//    - Optimistic update fires immediately
//    - Server response applied after to get server-assigned fields
//    - sizeKind + quantityBySize always explicitly sent in body
//
// 4. Sizes showing for all products:
//    - API already returns sizeKind + quantityBySize (camelCase)
//    - ProductCard reads them directly — no transform needed
//    - The only issue was products not loading (fixed by #1 above)
//
// 5. DELETE: pendingDeletesRef prevents poll resurrection
//
// 6. POS stock deduction fixed in POSPage.tsx + api_sales_route.ts
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ProductCard, { ProductCardSkeleton, type Product } from '../components/inventory/ProductCard';
import ProductModal from '../components/inventory/ProductModal';
import { type SizeCode } from '../components/inventory/SizesSection';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useInventory } from '../contexts/InventoryContext';

// ── Types ──────────────────────────────────────────────────────────────────

type FilterKey = 'all' | string;
type SortKey   = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

interface InventoryPageProps {
  // apiBaseUrl is kept for backward compat but we ignore it and use API_BASE_URL
  apiBaseUrl?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = ['Sneakers', 'Slippers', 'Boots', 'Sandals', 'Accessories'];

// ── Icons ──────────────────────────────────────────────────────────────────

const IconSearch  = () => (
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
const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);
const IconBox = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);

// ── Toast ──────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: string; message: string; type: ToastType; }

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  const border: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error:   'border-l-red-500',
    info:    'border-l-blue-500',
  };
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white text-[14px] font-medium
                      shadow-[0_8px_24px_rgba(0,0,0,0.2)] border-l-4 ${border[t.type]}
                      min-w-[220px] max-w-[340px] animate-[toastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Confirm delete ─────────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  product, onConfirm, onCancel
}: { product: Product; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onCancel}/>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[24px]
                      shadow-[0_-8px_40px_rgba(0,0,0,0.12)] px-5 pt-5 pb-8
                      animate-[sheetUp_0.28s_cubic-bezier(0.34,1.1,0.64,1)]">
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-5"/>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <IconTrash/>
          </div>
          <div>
            <p className="text-[16px] font-bold text-slate-900">Delete product?</p>
            <p className="text-[13px] text-slate-500 mt-1 leading-snug">
              <span className="font-semibold text-slate-700">{product.name}</span> will be permanently removed. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
                  className="flex-1 h-[52px] rounded-2xl border-[1.5px] border-slate-200 bg-white text-[15px] font-bold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
                  className="flex-1 h-[52px] rounded-2xl bg-red-500 hover:bg-red-600 text-[15px] font-bold text-white active:scale-[0.98] transition-all shadow-[0_4px_12px_rgba(239,68,68,0.3)]">
            Delete
          </button>
        </div>
      </div>
      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </>
  );
}

// ── Sort + filter ──────────────────────────────────────────────────────────

function applyFilters(products: Product[], search: string, category: FilterKey, sort: SortKey) {
  let r = [...products];
  if (search.trim()) {
    const q = search.toLowerCase();
    r = r.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    );
  }
  if (category !== 'all') {
    r = r.filter(p => p.category.toLowerCase() === category.toLowerCase());
  }
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

// ── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage({ apiBaseUrl: _ignored }: InventoryPageProps) {

  // ── Warehouse: single source of truth from context (synced with Sidebar + Dashboard) ──
  const { warehouses, currentWarehouseId, setCurrentWarehouseId } = useWarehouse();
  const displayWarehouses = useMemo(
    () => (warehouses.length > 0 ? warehouses : [{ id: currentWarehouseId, name: '—' }]),
    [warehouses, currentWarehouseId]
  );
  const currentWarehouse = displayWarehouses.find((w) => w.id === currentWarehouseId) ?? displayWarehouses[0];

  // ── Product data: single source of truth from context (same as Dashboard) ──
  const {
    products,
    isLoading: loading,
    error,
    refreshProducts,
    addProduct: contextAddProduct,
    updateProduct: contextUpdateProduct,
    deleteProduct: contextDeleteProduct,
  } = useInventory();

  // ── State ─────────────────────────────────────────────────────────────────
  const [sizeCodes, setSizeCodes] = useState<SizeCode[]>([]);
  const [whDropdown, setWhDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [activeEditId, setActiveEditId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const modalOpenRef = useRef(false);
  const lastSaveTimeRef = useRef<number>(0);

  const { toasts, show: showToast } = useToast();

  // ── apiFetch with retry + abort support ──────────────────────────────────
  // - Retries GET requests up to 3× with exponential backoff (Vercel cold starts)
  // - Accepts an external AbortSignal so stale requests can be cancelled
  // - Does NOT set credentials:'include' — this causes CORS preflight failures
  //   with wildcard origins. Auth is done via Bearer token header instead.

  const apiFetch = useCallback(async <T = unknown>(
    path: string,
    init?: RequestInit & { signal?: AbortSignal },
    _retryCount = 0
  ): Promise<T> => {
    const isReadOnly = !init?.method || init.method === 'GET';
    const timeoutMs  = 20_000;

    // Internal timeout controller — merged with any external signal
    const timeoutCtrl = new AbortController();
    const timeout     = setTimeout(() => timeoutCtrl.abort(), timeoutMs);

    // Merge external abort signal with our timeout signal
    let mergedSignal: AbortSignal = timeoutCtrl.signal;
    if (init?.signal) {
      const externalCtrl = new AbortController();
      init.signal.addEventListener('abort', () => externalCtrl.abort());
      timeoutCtrl.signal.addEventListener('abort', () => externalCtrl.abort());
      mergedSignal = externalCtrl.signal;
    }

    try {
      const headers = new Headers(getApiHeaders() as HeadersInit);
      if (init?.headers) {
        new Headers(init.headers as HeadersInit).forEach((v, k) => headers.set(k, v));
      }

      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
        // Do NOT use credentials:'include' — breaks CORS with specific origins
        signal: mergedSignal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg  = (body as { message?: string; error?: string }).message ?? (body as { error?: string }).error ?? `HTTP ${res.status}`;
        const e    = new Error(msg) as Error & { status: number };
        e.status   = res.status;
        throw e;
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;

    } catch (e: unknown) {
      clearTimeout(timeout);
      const err = e as Error & { status?: number };
      // Don't retry if explicitly aborted (e.g. warehouse switch)
      if (err.name === 'AbortError' && init?.signal?.aborted) throw e;
      // Retry GET on network/timeout errors
      const isNetworkErr = err.name === 'AbortError' || err.name === 'TypeError' ||
                           err.message?.includes('Failed to fetch') ||
                           err.message?.includes('network connection was lost');
      if (isReadOnly && isNetworkErr && _retryCount < 3) {
        const delay = (2 ** _retryCount) * 800; // 800ms, 1.6s, 3.2s
        console.warn(`[apiFetch] Retry ${_retryCount + 1}/3 for ${path} in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
        return apiFetch(path, init, _retryCount + 1);
      }
      if (err.name === 'AbortError') throw new Error('Request timed out — check your connection');
      throw e;
    }
  }, []);

  // ── Load size codes (per-warehouse; not in InventoryContext) ───────────────

  const loadSizeCodes = useCallback(async () => {
    try {
      const raw = await apiFetch<unknown>(
        `/api/size-codes?warehouse_id=${encodeURIComponent(currentWarehouseId)}`
      );
      const list = Array.isArray(raw) ? raw : (raw as { data?: SizeCode[] })?.data ?? [];
      setSizeCodes(list);
    } catch { /* non-critical */ }
  }, [currentWarehouseId, apiFetch]);

  // Load size codes when warehouse changes. Product list is from InventoryContext (refetches on warehouse change).
  useEffect(() => {
    loadSizeCodes();
  }, [currentWarehouseId, loadSizeCodes]);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openAddModal() { setEditingProduct(null); setModalOpen(true); }
  function openEditModal(p: Product) { setEditingProduct(structuredClone(p)); setModalOpen(true); }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    const msSinceSave = Date.now() - lastSaveTimeRef.current;
    if (msSinceSave > 5000) {
      refreshProducts({ silent: true }).catch(() => {});
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function executeDelete(product: Product) {
    setConfirmDelete(null);
    try {
      await contextDeleteProduct(product.id);
      showToast(`"${product.name}" deleted`, 'success');
    } catch (e: unknown) {
      const err = e as Error;
      showToast(err.message ?? 'Failed to delete', 'error');
    }
  }

  // ── Submit (add / edit) — delegate to InventoryContext (single source of truth) ──

  async function handleSubmit(
    payload: Omit<Product, 'id'> & { id?: string },
    isEdit: boolean
  ) {
    if (isEdit && payload.id) {
      try {
        const p = payload as Record<string, unknown>;
        await contextUpdateProduct(payload.id, {
          name: payload.name,
          sku: payload.sku,
          barcode: payload.barcode,
          category: payload.category,
          description: (p.description as string) ?? '',
          quantity: payload.quantity,
          costPrice: payload.costPrice,
          sellingPrice: payload.sellingPrice,
          reorderLevel: payload.reorderLevel ?? 0,
          sizeKind: payload.sizeKind,
          quantityBySize: payload.quantityBySize,
          warehouseId: currentWarehouseId,
        });
        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} updated`, 'success');
      } catch (e: unknown) {
        const err = e as Error;
        showToast(err.message ?? 'Failed to update', 'error');
        throw e;
      }
    } else {
      try {
        const p = payload as Record<string, unknown>;
        const loc = p.location && typeof p.location === 'object' ? p.location as Record<string, string> : {};
        const sup = p.supplier && typeof p.supplier === 'object' ? p.supplier as Record<string, string> : {};
        const addPayload = {
          ...payload,
          warehouseId: currentWarehouseId,
          sizeKind: payload.sizeKind,
          quantityBySize: payload.quantityBySize ?? [],
          quantity: payload.quantity,
          description: (p.description as string) ?? '',
          tags: Array.isArray(p.tags) ? p.tags as string[] : [],
          createdBy: (p.createdBy as string) ?? '',
          expiryDate: (p.expiryDate as Date | null) ?? null,
          location: { warehouse: '', aisle: loc.aisle ?? '', rack: loc.rack ?? '', bin: loc.bin ?? '' },
          supplier: { name: sup.name ?? '', contact: sup.contact ?? '', email: sup.email ?? '' },
        };
        delete (addPayload as Record<string, unknown>).id;
        await contextAddProduct(addPayload as Parameters<typeof contextAddProduct>[0]);
        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} added`, 'success');
      } catch (e: unknown) {
        const err = e as Error;
        showToast(err.message ?? 'Failed to add product', 'error');
        throw e;
      }
    }
  }

  // ── Stock quick-edit — delegate to InventoryContext ────────────────────────

  async function handleSaveStock(
    id: string,
    update: { quantity: number; quantityBySize: Product['quantityBySize']; sizeKind: string }
  ) {
    setActiveEditId(null);
    try {
      await contextUpdateProduct(id, {
        quantity: update.quantity,
        quantityBySize: update.quantityBySize,
        sizeKind: update.sizeKind as 'na' | 'one_size' | 'sized',
        warehouseId: currentWarehouseId,
      });
      showToast('Stock updated', 'success');
    } catch (e: unknown) {
      const err = e as Error;
      showToast(err.message ?? 'Failed to update stock', 'error');
      throw e;
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayed = applyFilters(products as Product[], search, category, sort);
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

      {/* ── Sticky Header ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-[20px] font-bold text-slate-900 leading-tight">Inventory</h1>

            {/* Warehouse selector */}
            <div className="relative mt-0.5">
              <button type="button" onClick={() => setWhDropdown(o => !o)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                {currentWarehouse.name}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {whDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWhDropdown(false)}/>
                  <div className="absolute left-0 top-6 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-40">
                    {displayWarehouses.map(w => (
                      <button key={w.id} type="button"
                              onClick={() => { setCurrentWarehouseId(w.id); setActiveEditId(null); setWhDropdown(false); }}
                              className={`w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors
                                ${currentWarehouseId === w.id ? 'text-red-500 bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                        {currentWarehouseId === w.id && '✓ '}{w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-medium text-slate-500 sm:block hidden" aria-hidden>
              Adding to: <span className="text-slate-700">{currentWarehouse.name}</span>
            </p>
            <button type="button" onClick={() => refreshProducts({ bypassCache: true })}
                    className="w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors">
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
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <IconSearch/>
            </span>
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
                                ? 'bg-red-500 border-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)]'
                                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            {cat === 'all' ? 'All' : cat}
          </button>
        ))}
      </div>

      {/* ── Results count + sort ── */}
      <div className="flex items-center justify-between px-4 pb-3">
        <p className="text-[12px] font-medium text-slate-400">
          {loading ? 'Loading…' : `${displayed.length} product${displayed.length !== 1 ? 's' : ''}`}
        </p>
        <div className="relative">
          <button type="button" onClick={() => setSortOpen(o => !o)}
                  className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700">
            {SORT_OPTIONS.find(o => o.key === sort)?.label ?? 'Sort'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {sortOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)}/>
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

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center text-red-300"><IconBox/></div>
            <div>
              <p className="text-[16px] font-bold text-slate-700">Couldn't load products</p>
              <p className="text-[13px] text-slate-400 mt-1 max-w-[280px]">{error}</p>
            </div>
            <button type="button" onClick={() => refreshProducts({ bypassCache: true })}
                    className="h-10 px-5 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 transition-colors">
              Retry
            </button>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i}/>)}
          </div>
        )}

        {/* Empty — no products in warehouse */}
        {!loading && !error && products.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300"><IconBox/></div>
            <div>
              <p className="text-[17px] font-bold text-slate-700 mb-1">No products yet</p>
              <p className="text-[14px] text-slate-400">Add your first product to get started.</p>
            </div>
            <button type="button" onClick={openAddModal}
                    className="h-12 px-6 rounded-xl bg-red-500 text-white text-[14px] font-semibold flex items-center gap-2 hover:bg-red-600 transition-colors shadow-[0_4px_12px_rgba(239,68,68,0.3)]">
              <IconPlus/> Add first product
            </button>
          </div>
        )}

        {/* Empty search/filter */}
        {!loading && !error && products.length > 0 && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-[15px] font-semibold text-slate-700">No results for "{search || category}"</p>
            <button type="button" onClick={() => { setSearch(''); setCategory('all'); }}
                    className="text-[13px] font-semibold text-red-500 hover:text-red-700">
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
                onEditOpen={id => { setActiveEditId(id); if (modalOpen) closeModal(); }}
                onEditClose={() => setActiveEditId(null)}
                onSaveStock={handleSaveStock}
                onEditFull={openEditModal}
                onDelete={p => setConfirmDelete(p)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      <ProductModal
        isOpen={modalOpen}
        product={editingProduct}
        sizeCodes={sizeCodes}
        warehouseId={currentWarehouseId}
        warehouseName={currentWarehouse.name}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {confirmDelete && (
        <ConfirmDeleteDialog
          product={confirmDelete}
          onConfirm={() => executeDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <ToastContainer toasts={toasts}/>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(10px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
