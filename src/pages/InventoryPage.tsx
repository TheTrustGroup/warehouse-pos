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
import { Package, AlertTriangle } from 'lucide-react';
import ProductCard, { ProductCardSkeleton } from '../components/inventory/ProductCard';
import ProductModal from '../components/inventory/ProductModal';
import { type SizeCode } from '../components/inventory/SizesSection';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { getApiCircuitBreaker } from '../lib/circuit';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { onUnauthorized } from '../lib/onUnauthorized';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useInventory } from '../contexts/InventoryContext';
import { useDashboardQuery } from '../hooks/useDashboardQuery';
import type { Warehouse, Product } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────

type FilterKey = 'all' | string;
type SortKey   = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_asc' | 'stock_desc';

interface InventoryPageProps {}

// ── Constants ─────────────────────────────────────────────────────────────

const POLL_MS    = 30_000;
/** Desktop: show 50 per page. Mobile: smaller for faster paint and less scroll. */
const PAGE_SIZE_DESKTOP = 50;
const PAGE_SIZE_MOBILE  = 20;
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
  const qbs = p.quantityBySize ?? [];
  if (p.sizeKind === 'sized' && qbs.length > 0) {
    return qbs.reduce((s, r) => s + (r.quantity ?? 0), 0);
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

/** Human-readable "last updated" for header subtitle. */
function formatLastUpdated(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.min(min, 60)}m ago`;
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
  const safeToasts = (toasts ?? []).filter((t): t is ToastItem => t != null && typeof t === 'object' && typeof t.type === 'string');
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
      {safeToasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-[13px] font-semibold text-white min-w-[220px] max-w-[340px]
                      animate-[toastIn_0.35s_cubic-bezier(0.34,1.56,0.64,1)] border-l-[3px] ${styles[t.type]}`}
          style={{ background: 'var(--edk-sidebar-bg)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
        >
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
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} aria-hidden />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] px-5 pt-5 pb-10 animate-[sheetUp_0.3s_cubic-bezier(0.34,1.1,0.64,1)]"
        style={{ background: 'var(--edk-surface)', boxShadow: '0 -8px 48px rgba(0,0,0,0.15)' }}
      >
        <div className="w-10 h-1 rounded-full bg-[var(--edk-border-mid)] mx-auto mb-6" aria-hidden />
        <div className="flex items-start gap-4 mb-7">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 bg-[var(--edk-red-soft)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--edk-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <p className="text-[17px] font-black text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Delete product?
            </p>
            <p className="text-[13px] text-[var(--edk-ink-2)] mt-1 leading-relaxed">
              <span className="font-semibold text-[var(--edk-ink)]">&quot;{product.name}&quot;</span> will be
              permanently removed from inventory. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} className="flex-1 h-[52px]">
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={onConfirm} className="flex-1 h-[52px]">
            Delete
          </Button>
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

  const {
    products,
    isLoading: loading,
    error,
    refreshProducts,
    hasMore,
    loadMore,
    isLoadingMore,
    isBackgroundRefreshing: backgroundRefreshing,
    lastSyncAt,
    addProduct: contextAddProduct,
    updateProduct: contextUpdateProduct,
    deleteProduct: contextDeleteProduct,
  } = useInventory();
  const lastRefreshedAt = lastSyncAt ? lastSyncAt.getTime() : null;

  // ── State ─────────────────────────────────────────────────────────────────
  const [sizeCodes, setSizeCodes] = useState<SizeCode[]>([]);
  const search = searchFromUrl;
  const [category, setCategory] = useState<FilterKey>('all');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<SortKey>('name_asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  const modalOpenRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const didInitialLoad = useRef(false);

  /** Mobile-first: smaller first request and page size on narrow viewports. */
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const pageSize = isMobileViewport ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;

  const { toasts, show: showToast } = useToast();

  // Prefer dashboard API stats (accurate over all products); fallback to computed from loaded list
  const { dashboard } = useDashboardQuery(warehouseId ?? '');
  const statsFromProducts = useMemo(() => computeStats(products), [products]);
  const stats = useMemo(() => {
    if (dashboard) {
      return {
        totalValue: Number(dashboard.totalStockValue) || 0,
        totalUnits: typeof dashboard.totalUnits === 'number' ? dashboard.totalUnits : statsFromProducts.totalUnits,
        lowCount: Number(dashboard.lowStockCount) || 0,
        outCount: Number(dashboard.outOfStockCount) || 0,
      };
    }
    return statsFromProducts;
  }, [dashboard, statsFromProducts]);
  const skuCount = dashboard != null ? (Number(dashboard.totalProducts) || 0) : products.length;

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
    const interval = isMobileViewport ? Math.max(POLL_MS, 60_000) : POLL_MS;
    pollTimerRef.current = setInterval(() => {
      if (!modalOpenRef.current && document.visibilityState === 'visible') {
        refreshProducts({ silent: true });
      }
    }, interval);
  }
  function stopPoll() {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  // Context loads products on warehouse change. We only load size codes and start poll.

  useEffect(() => {
    setCategory('all');
    didInitialLoad.current = false;
    loadSizeCodes();
    const pollDelay = isValidWarehouseId(warehouseId) ? setTimeout(() => startPoll(), 5000) : null;
    const onVisible = () => {
      if (!didInitialLoad.current) return;
      if (document.visibilityState === 'visible' && !modalOpenRef.current && isValidWarehouseId(warehouseId)) {
        refreshProducts({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const initGate = setTimeout(() => { didInitialLoad.current = true; }, 500);
    return () => {
      if (pollDelay != null) clearTimeout(pollDelay);
      clearTimeout(initGate);
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // Re-render periodically when we show "Updated X ago" so the label stays accurate.
  const [, setRefreshLabelTick] = useState(0);
  useEffect(() => {
    if (lastRefreshedAt == null) return;
    const interval = setInterval(() => setRefreshLabelTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, [lastRefreshedAt]);

  // ── Modal ─────────────────────────────────────────────────────────────────

  function openAddModal()          { setEditingProduct(null); setModalOpen(true); }
  function openEditModal(p: Product) { setEditingProduct(structuredClone(p)); setModalOpen(true); }

  function closeModal() {
    setModalOpen(false);
    setEditingProduct(null);
    const msSinceSave = Date.now() - lastSaveTimeRef.current;
    if (msSinceSave > 5000) setTimeout(() => refreshProducts({ silent: true }), 500);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function executeDelete(product: Product) {
    setConfirmDelete(null);
    try {
      await contextDeleteProduct(product.id);
      showToast(`"${product.name}" deleted`, 'success');
    } catch (e: unknown) {
      showToast(getUserFriendlyMessage(e), 'error');
    }
  }

  // ── Submit (add / edit) ───────────────────────────────────────────────────

  async function handleSubmit(
    payload: Omit<Product, 'id'> & { id?: string },
    isEdit: boolean
  ) {
    const description = (payload as { description?: string }).description ?? '';
    const quantityBySize = Array.isArray(payload.quantityBySize) ? payload.quantityBySize : [];
    const quantity = payload.quantity ?? 0;

    if (isEdit && payload.id) {
      try {
        await contextUpdateProduct(payload.id, {
          ...payload,
          warehouseId,
          barcode: payload.barcode ?? '',
          description,
          sizeKind: payload.sizeKind,
          quantityBySize,
          quantity,
        } as Parameters<typeof contextUpdateProduct>[1]);
        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} updated`, 'success');
      } catch (e: unknown) {
        showToast(getUserFriendlyMessage(e), 'error');
        throw e;
      }
    } else {
      try {
        const { id: _omit, ...rest } = payload;
        await contextAddProduct({
          ...rest,
          warehouseId,
          barcode: payload.barcode ?? '',
          description,
          sizeKind: payload.sizeKind ?? 'na',
          quantityBySize,
          quantity,
          tags: rest.tags ?? [],
          supplier: rest.supplier ?? { name: '', contact: '', email: '' },
          expiryDate: rest.expiryDate ?? null,
          createdBy: rest.createdBy ?? '',
          location: rest.location ?? { warehouse: '', aisle: '', rack: '', bin: '' },
          images: rest.images ?? [],
        } as Parameters<typeof contextAddProduct>[0]);
        lastSaveTimeRef.current = Date.now();
        showToast(`${payload.name} added`, 'success');
      } catch (e: unknown) {
        showToast(getUserFriendlyMessage(e), 'error');
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
  /** Total to show in "Showing X–Y of N": when no filters applied, use warehouse total from dashboard (e.g. 205) so it matches the SKU card; when filtered, use filtered count (e.g. 12). */
  const hasActiveFilters = Boolean(search.trim() || category !== 'all' || sizeFilter || colorFilter);
  const totalForDisplay = hasActiveFilters ? totalFiltered : (dashboard != null && skuCount >= 0 ? skuCount : totalFiltered);
  /** Page count over full list (205 → 11 pages at 20/page), so user can go to page 4 and we load more until we have items 61–80. */
  const totalPages = Math.max(1, Math.ceil(totalForDisplay / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const displayed = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize]
  );
  /** Current page needs items we haven't loaded yet (e.g. page 4 needs 61–80, we have 50). */
  const pageNeedsMore = totalFiltered < pageStart + pageSize && hasMore && !hasActiveFilters;
  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'name_asc',   label: 'Name A–Z'       },
    { key: 'name_desc',  label: 'Name Z–A'       },
    { key: 'price_asc',  label: 'Price low–high' },
    { key: 'price_desc', label: 'Price high–low' },
    { key: 'stock_asc',  label: 'Stock low–high' },
    { key: 'stock_desc', label: 'Stock high–low' },
  ];

  const alertCount = stats.outCount + stats.lowCount;

  // One-time auto-retry when dashboard says products exist but list didn't load (improves fetch stability).
  const didRetryEmptyListRef = useRef(false);
  useEffect(() => {
    didRetryEmptyListRef.current = false;
  }, [warehouseId]);
  useEffect(() => {
    if (products.length > 0) didRetryEmptyListRef.current = false;
  }, [products.length]);
  useEffect(() => {
    if (!dashboard || skuCount <= 0 || products.length > 0 || loading || error) return;
    if (didRetryEmptyListRef.current) return;
    didRetryEmptyListRef.current = true;
    const t = setTimeout(() => {
      refreshProducts({ bypassCache: true }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [dashboard, skuCount, products.length, loading, error, refreshProducts]);

  // Auto-load more when user is on a page that requires items not yet loaded (e.g. page 4 needs 61–80, we have 50).
  useEffect(() => {
    if (!pageNeedsMore || isLoadingMore) return;
    loadMore();
  }, [pageNeedsMore, isLoadingMore, loadMore]);

  // Clamp current page when totalPages shrinks (e.g. after applying a filter).
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(Math.max(1, totalPages));
  }, [currentPage, totalPages]);

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
          <p className="text-[12px] text-[var(--edk-ink-3)]" aria-live="polite">
            {totalForDisplay > 0 && products.length < totalForDisplay
              ? `${totalForDisplay} product${totalForDisplay !== 1 ? 's' : ''} (${products.length} loaded)`
              : `${products.length} product${products.length !== 1 ? 's' : ''}`} · Page {currentPage} of {totalPages}
            {backgroundRefreshing && (
              <span className="text-[var(--edk-ink-3)]"> · Updating…</span>
            )}
            {!backgroundRefreshing && lastRefreshedAt != null && products.length > 0 && (
              <span className="text-[var(--edk-ink-3)]"> · Updated {formatLastUpdated(lastRefreshedAt)}</span>
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={openAddModal}
          leftIcon={<PlusIcon />}
          className="flex-shrink-0 shadow-[0_1px_3px_var(--edk-red-soft)]"
        >
          Add product
        </Button>
      </div>

      {/* Stats: from dashboard API when available (all products); otherwise from loaded list */}
      {!loading && !error && (products.length > 0 || (dashboard && skuCount >= 0)) && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          <StatCard
            label="SKUs"
            value={skuCount}
            sub={totalPages > 1 ? `Showing ${pageStart + 1}–${Math.min(pageStart + pageSize, totalFiltered)} of ${totalForDisplay}` : (totalForDisplay > totalFiltered ? `${totalFiltered} loaded of ${totalForDisplay}` : `${totalFiltered} shown`)}
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
                <div className="absolute right-0 top-full mt-1 z-20 bg-[var(--edk-surface)] rounded-xl shadow-lg border border-[var(--edk-border)] py-1.5 w-44">
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
          Showing <strong className="text-[var(--edk-ink-2)] font-semibold">{pageStart + 1}–{Math.min(pageStart + pageSize, totalFiltered)}</strong> of {totalForDisplay}
        </span>
      </div>

      {/* Main content */}
      <main>

        {/* Error — design system EmptyState + Button */}
        {(error || getApiCircuitBreaker().isDegraded()) && (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load products"
            description={error || (getApiCircuitBreaker().isDegraded() ? 'Server temporarily unavailable. Tap Retry to try again.' : undefined)}
            action={
              <Button
                variant="primary"
                onClick={() => { getApiCircuitBreaker().reset(); refreshProducts({ bypassCache: true, timeoutMs: 90_000 }); }}
                aria-label="Retry loading products"
              >
                Retry
              </Button>
            }
            className="py-12"
          />
        )}

        {/* Skeletons */}
        {loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: isMobileViewport ? 4 : 6 }).map((_, i) => <ProductCardSkeleton key={i}/>)}
          </div>
        )}

        {/* List failed to load but dashboard says products exist */}
        {!loading && !error && products.length === 0 && dashboard != null && skuCount > 0 && (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load product list"
            description={`This warehouse has ${skuCount} product${skuCount !== 1 ? 's' : ''}. The list didn't load. Tap Retry to try again.`}
            action={
              <Button
                variant="primary"
                onClick={() => { getApiCircuitBreaker().reset(); refreshProducts({ bypassCache: true, timeoutMs: 90_000 }); }}
                aria-label="Retry loading product list"
              >
                Retry
              </Button>
            }
            className="py-12"
          />
        )}

        {/* Empty warehouse — design system EmptyState + Button */}
        {!loading && !error && products.length === 0 && !(dashboard != null && skuCount > 0) && (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Add your first product to get started."
            action={
              <Button variant="primary" onClick={openAddModal} leftIcon={<PlusIcon />}>
                Add your first product
              </Button>
            }
            className="py-12"
          />
        )}

        {/* Loading more for current page (e.g. page 4 needs items 61–80, we had 50; auto-loading) */}
        {!loading && !error && products.length > 0 && pageNeedsMore && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 w-full">
              {Array.from({ length: isMobileViewport ? 4 : 6 }).map((_, i) => <ProductCardSkeleton key={`page-load-${i}`} />)}
            </div>
            <p className="text-[13px] text-[var(--edk-ink-3)]">{isLoadingMore ? 'Loading page…' : 'Load more to view this page'}</p>
            {!isLoadingMore && hasMore && (
              <Button type="button" variant="secondary" size="sm" onClick={() => loadMore()}>
                Load more
              </Button>
            )}
          </div>
        )}

        {/* Empty filter */}
        {!loading && !error && products.length > 0 && displayed.length === 0 && !pageNeedsMore && (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <p className="text-[15px] font-bold text-[var(--edk-ink-2)]">
              No results for current filters
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setSearchParams({}); setCategory('all'); setSizeFilter(''); setColorFilter(''); setCurrentPage(1); }}
              className="text-[var(--edk-red)] hover:text-[var(--edk-red-hover)]"
            >
              Clear filters
            </Button>
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
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <span className="text-[13px] font-semibold text-[var(--edk-ink-2)]">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            )}
            {/* Load more (fetch next page from API) */}
            {hasMore && (
              <div className="flex justify-center py-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => loadMore()}
                  disabled={isLoadingMore}
                  loading={isLoadingMore}
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </Button>
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
