// ============================================================
// InventoryPage.tsx
// File: warehouse-pos/src/pages/InventoryPage.tsx
//
// World-class inventory dashboard. Design principles:
//   • Summary stat bar at top (total SKUs, total stock value, low/out alerts)
//   • Clean sticky header — warehouse selector + ONE search + Add button
//   • Category filter chips + sort — no clutter
//   • Cards show stock bar, size breakdown, price — no inline edit, no duplicates
//   • All working logic preserved exactly: retry, poll, abort, optimistic updates,
//     lastSaveTimeRef guard, pendingDeletesRef, size-wipe guard
// ============================================================

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard, { ProductCardSkeleton, type Product } from '../components/inventory/ProductCard';
import ProductModal from '../components/inventory/ProductModal';
import { type SizeCode } from '../components/inventory/SizesSection';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { getApiCircuitBreaker } from '../lib/circuit';
import { onUnauthorized } from '../lib/onUnauthorized';
import { useWarehouse } from '../contexts/WarehouseContext';
import type { Warehouse } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────

type FilterKey = 'all' | string;
type SortKey   = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

interface InventoryPageProps {}

// ── Constants ─────────────────────────────────────────────────────────────

const POLL_MS    = 30_000;
const PAGE_SIZE  = 50;
const CATEGORIES = ['Sneakers', 'Slippers', 'Boots', 'Sandals', 'Accessories'];

/** Color filter options (pills). "All" and "Uncategorized" plus standard palette. */
const COLOR_OPTIONS = ['All', 'Black', 'White', 'Red', 'Blue', 'Brown', 'Green', 'Grey', 'Navy', 'Beige', 'Multi', 'Uncategorized'];

/** Fallback list when WarehouseContext has not yet loaded. IDs must match backend. */
const FALLBACK_WAREHOUSES: Pick<Warehouse, 'id' | 'name'>[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town' },
];

/** Reject empty or all-zeros warehouse id so we never call APIs with an invalid scope. */
function isValidWarehouseId(id: string): boolean {
  const t = (id ?? '').trim();
  return t.length > 0 && t !== '00000000-0000-0000-0000-000000000000';
}

// ── Stat helpers ──────────────────────────────────────────────────────────

function getProductQty(p: Product): number {
  if (p.sizeKind === 'sized' && p.quantityBySize?.length > 0) {
    return p.quantityBySize.reduce((s, r) => s + (r.quantity ?? 0), 0);
  }
  return p.quantity ?? 0;
}

function computeStats(products: Product[]) {
  let totalValue = 0;
  let totalUnits = 0;
  let lowCount   = 0;
  let outCount   = 0;

  for (const p of products) {
    const qty     = getProductQty(p);
    const reorder = p.reorderLevel ?? 3;
    totalUnits += qty;
    totalValue += qty * (p.sellingPrice ?? 0);
    if (qty === 0) outCount++;
    else if (qty <= reorder) lowCount++;
  }

  return { totalValue, totalUnits, lowCount, outCount };
}

function formatGHC(n: number): string {
  if (n >= 1_000_000) return 'GH₵ ' + (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return 'GH₵ ' + (n / 1_000).toFixed(1) + 'K';
  return 'GH₵ ' + n.toLocaleString('en-GH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Filter/sort ───────────────────────────────────────────────────────────

function applyFilters(
  products: Product[],
  search: string,
  category: FilterKey,
  sort: SortKey,
  sizeFilter: string,
  colorFilter: string
) {
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
  if (sizeFilter) {
    const sizeNorm = sizeFilter.trim().toLowerCase();
    r = r.filter(p => {
      if (sizeNorm === 'na') return (p.sizeKind ?? 'na') === 'na';
      if (sizeNorm === 'one size') return (p.sizeKind ?? 'na') === 'one_size';
      const qbs = p.quantityBySize ?? [];
      return qbs.some(s => (s.sizeCode ?? '').toLowerCase() === sizeNorm);
    });
  }
  if (colorFilter) {
    const colorNorm = colorFilter.trim().toLowerCase();
    const getColor = (p: Product) => (p as Product & { color?: string }).color ?? p.variants?.color ?? '';
    if (colorNorm === 'uncategorized') {
      r = r.filter(p => !getColor(p).trim());
    } else {
      r = r.filter(p => getColor(p).trim().toLowerCase() === colorNorm);
    }
  }
  r.sort((a, b) => {
    const qa = getProductQty(a), qb = getProductQty(b);
    switch (sort) {
      case 'name_asc':   return a.name.localeCompare(b.name);
      case 'name_desc':  return b.name.localeCompare(a.name);
      case 'price_asc':  return a.sellingPrice - b.sellingPrice;
      case 'price_desc': return b.sellingPrice - a.sellingPrice;
      case 'stock_asc':  return qa - qb;
      case 'stock_desc': return qb - qa;
      default:           return 0;
    }
  });
  return r;
}

/** Ensure quantityBySize is always an array (API/view may return scalar). */
function normalizeQuantityBySize(p: Record<string, unknown>): Product {
  const qbs = p['quantityBySize'] ?? p['quantity_by_size'];
  const arr = Array.isArray(qbs) ? qbs : [];
  return { ...p, quantityBySize: arr } as Product;
}

function unwrapProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const inner = r.data ?? r.product ?? r;
  if (!inner || typeof inner !== 'object' || !('id' in inner)) return null;
  return normalizeQuantityBySize(inner as Record<string, unknown>);
}

/** Normalize API list so each product has variants.color from API's top-level color (for color filter). */
function unwrapProductList(raw: unknown): Product[] {
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => ({
      ...item,
      variants: {
        ...(typeof item.variants === 'object' && item.variants ? item.variants : {}),
        color: (item.color != null ? String(item.color).trim() : '') || (item.variants as { color?: string } | undefined)?.color,
      },
    })) as Product[];
  }
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as Record<string, unknown>;
  const list = r.data ?? r.products ?? r.items ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((item: Record<string, unknown>) => ({
    ...item,
    variants: {
      ...(typeof item.variants === 'object' && item.variants ? item.variants : {}),
      color: (item.color != null ? String(item.color).trim() : '') || (item.variants as { color?: string } | undefined)?.color,
    },
  })) as Product[];
}

// ── Toast ─────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: string; message: string; type: ToastType; }

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  const styles: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error:   'border-l-red-500',
    info:    'border-l-blue-500',
  };
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-slate-900 text-white
                      text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.25)]
                      border-l-[3px] ${styles[t.type]} min-w-[220px] max-w-[340px]
                      animate-[toastIn_0.35s_cubic-bezier(0.34,1.56,0.64,1)]`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────

function DeleteDialog({
  product, onConfirm, onCancel
}: { product: Product; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onCancel}/>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[28px]
                      shadow-[0_-8px_48px_rgba(0,0,0,0.15)] px-5 pt-5 pb-10
                      animate-[sheetUp_0.3s_cubic-bezier(0.34,1.1,0.64,1)]">
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-6"/>
        <div className="flex items-start gap-4 mb-7">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <p className="text-[17px] font-black text-slate-900">Delete product?</p>
            <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">
              <span className="font-semibold text-slate-800">&quot;{product.name}&quot;</span> will be
              permanently removed from inventory. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel}
                  className="flex-1 h-[52px] rounded-2xl border-[1.5px] border-slate-200
                             text-[15px] font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
                  className="flex-1 h-[52px] rounded-2xl bg-red-500 hover:bg-red-600
                             text-[15px] font-bold text-white transition-colors
                             shadow-[0_4px_16px_rgba(239,68,68,0.3)]">
            Delete
          </button>
        </div>
      </div>
      <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = false, warning = false, className = '',
}: {
  label:    string;
  value:    string | number;
  sub?:     string;
  accent?:  boolean;
  warning?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[var(--edk-radius)] border px-4 py-4 flex flex-col gap-1 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ${className} ${
        accent
          ? 'bg-[var(--edk-red)] border-transparent text-white'
          : warning
            ? 'bg-[var(--edk-amber-bg)] border-[rgba(217,119,6,0.15)]'
            : 'bg-[var(--edk-surface)] border-[var(--edk-border)] text-[var(--edk-ink)]'
      }`}
    >
      <p
        className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${
          accent ? 'text-white/65' : warning ? 'text-[var(--edk-amber)]' : 'text-[var(--edk-ink-3)]'
        }`}
      >
        {label}
      </p>
      <p
        className="text-[28px] font-extrabold tabular-nums leading-none tracking-tight truncate"
        style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
      >
        {value}
      </p>
      {sub && (
        <p className={`text-[11px] mt-0.5 ${accent ? 'text-white/60' : warning ? 'text-[var(--edk-amber)]/70' : 'text-[var(--edk-ink-3)]'}`}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────

const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const BoxIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

// ── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage(_props: InventoryPageProps) {

  // ── Warehouse from context (SINGLE SOURCE OF TRUTH) ──────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const searchFromUrl = searchParams.get('q') ?? '';

  const {
    currentWarehouseId: warehouseId,
    currentWarehouse,
    warehouses: contextWarehouses,
  } = useWarehouse();
  const warehouseList = contextWarehouses?.length ? contextWarehouses : FALLBACK_WAREHOUSES;
  const warehouse = currentWarehouse ?? warehouseList.find(w => w.id === warehouseId) ?? warehouseList[0];

  // ── State ─────────────────────────────────────────────────────────────────
  const [products,       setProducts]       = useState<Product[]>([]);
  const [sizeCodes,      setSizeCodes]      = useState<SizeCode[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const search = searchFromUrl;
  const [category,       setCategory]       = useState<FilterKey>('all');
  const [sizeFilter,     setSizeFilter]     = useState('');
  const [colorFilter,    setColorFilter]   = useState('');
  const [currentPage,    setCurrentPage]    = useState(1);
  const [sort,           setSort]           = useState<SortKey>('name_asc');
  const [sortOpen,       setSortOpen]       = useState(false);
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState<Product | null>(null);

  const modalOpenRef      = useRef(false);
  const pollTimerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingDeletesRef = useRef<Set<string>>(new Set());
  const loadInflightRef   = useRef(false);
  const lastSaveTimeRef   = useRef<number>(0);
  const loadAbortRef      = useRef<AbortController | null>(null);
  const didInitialLoad    = useRef(false);

  const { toasts, show: showToast } = useToast();

  // Derived stats (memoised — recompute only when products change)
  const stats = useMemo(() => computeStats(products), [products]);

  // Unique size codes from products (for size filter dropdown; color uses COLOR_OPTIONS pills)
  const uniqueSizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.sizeKind === 'na') set.add('NA');
      else if (p.sizeKind === 'one_size') set.add('One size');
      else for (const s of p.quantityBySize ?? []) if (s.sizeCode) set.add(s.sizeCode);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  // ── apiFetch (retry + abort) ──────────────────────────────────────────────

  const apiFetch = useCallback(async <T = unknown>(
    path: string,
    init?: RequestInit & { signal?: AbortSignal },
    _retryCount = 0
  ): Promise<T> => {
    const isReadOnly  = !init?.method || init.method === 'GET';
    const timeoutCtrl = new AbortController();
    const timeout     = setTimeout(() => timeoutCtrl.abort(), 20_000);

    let mergedSignal = timeoutCtrl.signal;
    if (init?.signal) {
      const m = new AbortController();
      init.signal.addEventListener('abort', () => m.abort());
      timeoutCtrl.signal.addEventListener('abort', () => m.abort());
      mergedSignal = m.signal;
    }

    try {
      const headers = new Headers(getApiHeaders() as HeadersInit);
      if (init?.headers) {
        new Headers(init.headers as HeadersInit).forEach((v, k) => headers.set(k, v));
      }

      const res = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers,
        signal: mergedSignal,
        credentials: 'include',
      });
      clearTimeout(timeout);

      if (!res.ok) {
        if (res.status === 401) onUnauthorized();
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
      if (err.name === 'AbortError' && init?.signal?.aborted) throw e;
      const isNetErr = err.name === 'AbortError' || err.name === 'TypeError' ||
                       err.message?.includes('Failed to fetch') ||
                       err.message?.includes('network connection was lost');
      if (isReadOnly && isNetErr && _retryCount < 3) {
        const delay = (2 ** _retryCount) * 800;
        await new Promise(r => setTimeout(r, delay));
        return apiFetch(path, init, _retryCount + 1);
      }
      if (err.name === 'AbortError') throw new Error('Request timed out — check your connection');
      throw e;
    }
  }, []);

  // ── Load products ─────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (silent = false) => {
    if (modalOpenRef.current) return;
    if (loadInflightRef.current) {
      if (silent) return;
      loadAbortRef.current?.abort();
    }

    const ctrl = new AbortController();
    loadAbortRef.current    = ctrl;
    loadInflightRef.current = true;
    if (!silent) setLoading(true);
    setError(null);

    try {
      const PAGE = 100;
      const MAX = 500;
      const raw = await apiFetch<unknown>(
        `/api/products?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${PAGE}&offset=0`,
        { signal: ctrl.signal }
      );
      if (ctrl.signal.aborted) return;
      let list = unwrapProductList(raw);
      const total = (raw != null && typeof raw === 'object' && 'total' in raw) ? (raw as { total?: number }).total : undefined;
      if (typeof total === 'number' && total > list.length && list.length === PAGE) {
        for (let offset = PAGE; offset < Math.min(total, MAX) && !ctrl.signal.aborted; offset += PAGE) {
          try {
            const next = await apiFetch<unknown>(
              `/api/products?warehouse_id=${encodeURIComponent(warehouseId)}&limit=${PAGE}&offset=${offset}`,
              { signal: ctrl.signal }
            );
            if (ctrl.signal.aborted) return;
            const nextList = unwrapProductList(next);
            list = list.concat(nextList);
            if (nextList.length < PAGE) break;
          } catch (pageErr) {
            if (ctrl.signal.aborted) return;
            const pending = pendingDeletesRef.current;
            setProducts(pending.size > 0 ? list.filter(p => !pending.has(p.id)) : list);
            getApiCircuitBreaker().recordFailure();
            if (!silent) setError(list.length > 0
              ? `Loaded ${list.length} products; could not load the rest. Try again or continue with the current list.`
              : (pageErr instanceof Error ? pageErr.message : 'Failed to load products'));
            return;
          }
        }
      }
      const pending = pendingDeletesRef.current;
      setProducts(pending.size > 0 ? list.filter(p => !pending.has(p.id)) : list);
      getApiCircuitBreaker().recordSuccess();
    } catch (e: unknown) {
      const err = e as Error;
      if (err.name === 'AbortError' || ctrl.signal.aborted) return;
      getApiCircuitBreaker().recordFailure();
      if (!silent) setError(err.message ?? 'Failed to load products');
    } finally {
      if (loadAbortRef.current === ctrl) {
        loadInflightRef.current = false;
        loadAbortRef.current    = null;
      }
      if (!silent) setLoading(false);
    }
  }, [warehouseId, apiFetch]);

  // ── Load size codes ───────────────────────────────────────────────────────

  const loadSizeCodes = useCallback(async () => {
    try {
      const raw  = await apiFetch<unknown>('/api/size-codes');
      const list = Array.isArray(raw) ? raw : (raw as { data?: SizeCode[] })?.data ?? [];
      setSizeCodes(list);
    } catch { /* non-critical */ }
  }, [apiFetch]);

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
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    setProducts([]); setLoading(true); setError(null);
    setCategory('all');
    didInitialLoad.current = false;
    loadAbortRef.current?.abort();

    loadSizeCodes();
    if (isValidWarehouseId(warehouseId)) {
      loadProducts();
    } else {
      setLoading(false);
    }
    const pollDelay = isValidWarehouseId(warehouseId) ? setTimeout(() => startPoll(), 5000) : null;

    const onVisible = () => {
      if (!didInitialLoad.current) return;
      if (document.visibilityState === 'visible' && !modalOpenRef.current && isValidWarehouseId(warehouseId)) loadProducts(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    const initGate = setTimeout(() => { didInitialLoad.current = true; }, 500);

    return () => {
      if (pollDelay != null) clearTimeout(pollDelay);
      clearTimeout(initGate);
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
      loadAbortRef.current?.abort();
    };
  }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openAddModal()          { setEditingProduct(null); setModalOpen(true); }
  function openEditModal(p: Product) { setEditingProduct(structuredClone(p)); setModalOpen(true); }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    const msSinceSave = Date.now() - lastSaveTimeRef.current;
    if (msSinceSave > 5000) setTimeout(() => loadProducts(true), 500);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function executeDelete(product: Product) {
    setConfirmDelete(null);
    pendingDeletesRef.current.add(product.id);
    setProducts(prev => prev.filter(p => p.id !== product.id));

    try {
      await apiFetch(`/api/products?id=${encodeURIComponent(product.id)}&warehouse_id=${encodeURIComponent(warehouseId)}`, {
        method: 'DELETE',
      });
      pendingDeletesRef.current.delete(product.id);
      showToast(`"${product.name}" deleted`, 'success');
    } catch (e: unknown) {
      pendingDeletesRef.current.delete(product.id);
      const err = e as Error;
      setProducts(prev => {
        if (prev.find(p => p.id === product.id)) return prev;
        return [...prev, product].sort((a, b) => a.name.localeCompare(b.name));
      });
      showToast(err.message ?? 'Failed to delete', 'error');
    }
  }

  // ── Submit (add / edit) ───────────────────────────────────────────────────

  async function handleSubmit(
    payload: Omit<Product, 'id'> & { id?: string },
    isEdit:  boolean
  ) {
    if (isEdit && payload.id) {
      const original  = products.find(p => p.id === payload.id);
      const optimistic = { ...original, ...payload } as Product;
      setProducts(prev => prev.map(p => p.id === payload.id ? optimistic : p));

      try {
        const raw = await apiFetch<unknown>(`/api/products`, {
          method: 'PUT',
          body:   JSON.stringify({
            ...payload,
            id: payload.id,
            warehouseId,
            barcode: payload.barcode ?? '',
            description: (payload as { description?: string }).description ?? '',
            sizeKind:       payload.sizeKind,
            quantityBySize: Array.isArray(payload.quantityBySize) ? payload.quantityBySize : [],
            quantity:       payload.quantity,
          }),
        });

        const updated = unwrapProduct(raw);
        if (updated) {
          const serverHasSizes  = (updated.quantityBySize?.length ?? 0) > 0;
          const payloadHasSizes = (payload.quantityBySize?.length  ?? 0) > 0;
          if (payloadHasSizes && !serverHasSizes) {
            console.warn('[handleSubmit] Server wiped sizes — keeping optimistic state');
          } else {
            setProducts(prev => prev.map(p => p.id === payload.id ? updated : p));
          }
        }

        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} updated`, 'success');
      } catch (e: unknown) {
        const err = e as Error;
        if (original) setProducts(prev => prev.map(p => p.id === payload.id ? original : p));
        showToast(err.message ?? 'Failed to update', 'error');
        throw e;
      }

    } else {
      try {
        const raw = await apiFetch<unknown>('/api/products', {
          method: 'POST',
          body:   JSON.stringify({
            ...payload,
            warehouseId,
            barcode: payload.barcode ?? '',
            description: (payload as { description?: string }).description ?? '',
            sizeKind:       payload.sizeKind,
            quantityBySize: Array.isArray(payload.quantityBySize) ? payload.quantityBySize : [],
            quantity:       payload.quantity,
          }),
        });

        let created = unwrapProduct(raw);
        if (created && (payload.quantityBySize?.length ?? 0) > 0
            && (created.quantityBySize?.length ?? 0) === 0) {
          created = { ...created, quantityBySize: payload.quantityBySize, quantity: payload.quantity };
        }

        if (created?.id) setProducts(prev => [created!, ...prev]);
        else setTimeout(() => loadProducts(true), 300);

        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} added`, 'success');
      } catch (e: unknown) {
        const err = e as Error;
        showToast(err.message ?? 'Failed to add product', 'error');
        throw e;
      }
    }
  }

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, category, sizeFilter, colorFilter, sort]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = useMemo(
    () => applyFilters(products, search, category, sort, sizeFilter, colorFilter),
    [products, search, category, sort, sizeFilter, colorFilter]
  );
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const displayed = useMemo(
    () => filtered.slice(pageStart, pageStart + PAGE_SIZE),
    [filtered, pageStart]
  );
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name_asc',   label: 'Name A–Z'       },
    { key: 'name_desc',  label: 'Name Z–A'       },
    { key: 'price_asc',  label: 'Price low–high' },
    { key: 'price_desc', label: 'Price high–low' },
    { key: 'stock_asc',  label: 'Stock low–high' },
    { key: 'stock_desc', label: 'Stock high–low' },
  ];

  const alertCount = stats.outCount + stats.lowCount;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--edk-bg)] pb-28" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[12px] text-[var(--edk-ink-3)] mb-4 px-0">
        <span>{warehouse?.name ?? 'Main Store'}</span>
        <span className="opacity-40" aria-hidden>›</span>
        <span className="text-[var(--edk-ink-2)] font-medium">Inventory</span>
      </div>

      {/* Page header: title + subtitle + Add product */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] font-extrabold tracking-wide text-[var(--edk-ink)] uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Inventory
          </h1>
          <p className="text-[12px] text-[var(--edk-ink-3)]">
            {products.length} product{products.length !== 1 ? 's' : ''} · Page {currentPage} of {totalPages}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="h-[34px] px-3.5 rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] hover:bg-[var(--edk-red-hover)] text-white text-[13px] font-semibold flex items-center gap-1.5 shadow-[0_1px_3px_rgba(232,40,26,0.3)] flex-shrink-0"
        >
          <PlusIcon /> Add product
        </button>
      </div>

      {/* Stats: on mobile 2-col with stock value full width; on desktop 3-col */}
      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <StatCard
            label="SKUs"
            value={products.length}
            sub={totalPages > 1 ? `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, totalFiltered)} of ${totalFiltered}` : `${totalFiltered} shown`}
          />
          {alertCount > 0 && (
            <StatCard
              label="Alerts"
              value={alertCount}
              sub={`${stats.outCount} out · ${stats.lowCount} low stock`}
              warning
            />
          )}
          <StatCard
            label="Stock Value"
            value={formatGHC(stats.totalValue)}
            sub={`${stats.totalUnits.toLocaleString()} total units`}
            accent
            className="col-span-2 lg:col-span-1"
          />
        </div>
      )}

      {/* Filter toolbar: category pills, Size/Color dropdowns, sort, results count */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          {(['all', ...CATEGORIES] as string[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 h-[30px] px-2.5 rounded-[20px] text-[12px] font-medium border whitespace-nowrap transition-all duration-150 ${
                category === cat
                  ? 'bg-[var(--edk-ink)] border-[var(--edk-ink)] text-white'
                  : 'bg-[var(--edk-surface)] border-[var(--edk-border-mid)] text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)]'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
          <select
            value={sizeFilter}
            onChange={(e) => setSizeFilter(e.target.value)}
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
            onChange={(e) => setColorFilter(e.target.value)}
            className="h-[30px] pl-2.5 pr-6 rounded-[20px] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] min-w-[100px] cursor-pointer appearance-none bg-no-repeat bg-[length:10px_6px] bg-[right_10px_center]"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%238A8784' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")` }}
            aria-label="Filter by color"
          >
            <option value="">Color: All</option>
            {COLOR_OPTIONS.filter((c) => c !== 'All').map((c) => (
              <option key={c} value={c === 'Uncategorized' ? 'uncategorized' : c}>{c}</option>
            ))}
          </select>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen((o) => !o)}
              className="flex items-center gap-1.5 h-[30px] px-2.5 rounded-[20px] border border-[var(--edk-border-mid)] bg-[var(--edk-surface)] text-[12px] font-medium text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)] whitespace-nowrap"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              {SORT_OPTIONS.find((o) => o.key === sort)?.label}
            </button>
            {sortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} aria-hidden />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-[var(--edk-border)] py-1.5 w-44">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => { setSort(opt.key); setSortOpen(false); }}
                      className={`w-full px-4 py-2 text-left text-[13px] font-medium transition-colors ${
                        sort === opt.key ? 'text-[var(--edk-red)] bg-[var(--edk-red-soft)]' : 'text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <span className="text-[11px] text-[var(--edk-ink-3)] whitespace-nowrap">
          Showing <strong className="text-[var(--edk-ink-2)] font-semibold">{pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, totalFiltered)}</strong> of {totalFiltered}
        </span>
      </div>

      {/* Main content */}
      <main>

        {/* Error */}
        {(error || getApiCircuitBreaker().isDegraded()) && (
          <div className="flex flex-col items-center gap-5 py-20 text-center">
            <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-red-300">
              <BoxIcon/>
            </div>
            <div>
              <p className="text-[17px] font-black text-slate-800">Couldn&apos;t load products</p>
              <p className="text-[13px] text-slate-500 mt-1 max-w-md mx-auto break-words leading-relaxed">
                {error || (getApiCircuitBreaker().isDegraded() ? 'Server temporarily unavailable (too many failed requests). Click Retry to try again.' : null)}
              </p>
            </div>
            <button type="button" onClick={() => { getApiCircuitBreaker().reset(); setError(null); loadProducts(); }}
                    className="h-10 px-6 rounded-xl bg-red-500 text-white text-[13px] font-bold
                               hover:bg-red-600 transition-colors shadow-[0_4px_12px_rgba(239,68,68,0.25)]">
              Retry
            </button>
          </div>
        )}

        {/* Skeletons */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i}/>)}
          </div>
        )}

        {/* Empty warehouse */}
        {!loading && !error && products.length === 0 && (
          <div className="flex flex-col items-center gap-5 py-24 text-center">
            <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-300">
              <BoxIcon/>
            </div>
            <div>
              <p className="text-[18px] font-black text-slate-800">No products yet</p>
              <p className="text-[14px] text-slate-400 mt-1">Add your first product to get started.</p>
            </div>
            <button type="button" onClick={openAddModal}
                    className="h-12 px-7 rounded-2xl bg-red-500 text-white text-[14px] font-bold
                               flex items-center gap-2 hover:bg-red-600 transition-colors
                               shadow-[0_6px_20px_rgba(239,68,68,0.35)]">
              <PlusIcon/> Add first product
            </button>
          </div>
        )}

        {/* Empty filter */}
        {!loading && !error && products.length > 0 && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-[15px] font-bold text-slate-700">
              No results for current filters
            </p>
            <button type="button" onClick={() => { setSearchParams({}); setCategory('all'); setSizeFilter(''); setColorFilter(''); setCurrentPage(1); }}
                    className="text-[13px] font-bold text-red-500 hover:text-red-700">
              Clear filters
            </button>
          </div>
        )}

        {/* Product grid — EDK card style: 10px radius, 4:3 image, hover lift */}
        {!loading && !error && displayed.length > 0 && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5">
              {displayed.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEditFull={openEditModal}
                  onDelete={p => setConfirmDelete(p)}
                />
              ))}
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-6">
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Previous
                </button>
                <span className="text-[13px] font-semibold text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* ══ Modals ══ */}
      <ProductModal
        isOpen={modalOpen}
        product={editingProduct}
        sizeCodes={sizeCodes}
        warehouseId={warehouseId}
        onSubmit={handleSubmit}
        onClose={closeModal}
      />

      {confirmDelete && (
        <DeleteDialog
          product={confirmDelete}
          onConfirm={() => executeDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <ToastContainer toasts={toasts}/>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)     scale(1);   }
        }
        @keyframes sheetUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0);    }
        }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
