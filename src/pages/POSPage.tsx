// ============================================================
// POSPage.tsx — warehouse-pos/src/pages/POSPage.tsx
//
// STOCK DEDUCTION — HOW IT WORKS:
//
//   1. Cashier taps "Charge GH₵450"
//   2. POST /api/sales → calls record_sale() Supabase RPC
//      → RPC atomically: inserts sale + sale_lines + deducts
//        warehouse_inventory_by_size (sized) or warehouse_inventory
//      → Returns { id, receiptId, total, itemCount, status, createdAt }
//   3. Frontend ALSO deducts stock locally (instant UI feedback)
//      — this is optimistic. Even if step 2 failed, cashier sees
//        correct stock immediately. Step 2 is the ground truth.
//   4. "New sale" button → reloads products from server
//      → this re-syncs frontend with DB truth after each sale
//
// If POST /api/sales fails (API not deployed, network error):
//   → Amber toast warning: "⚠ Sale not synced — deploy /api/sales"
//   → Checkout still completes (cashier not blocked)
//   → Stock IS deducted optimistically in UI
//   → Next loadProducts() call will restore real server values
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { onUnauthorized } from '../lib/onUnauthorized';
import { printReceipt, formatReceiptDate } from '../lib/printReceipt';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';

import type { Warehouse } from '../components/pos/SessionScreen';
import POSHeader from '../components/pos/POSHeader';
import ProductGrid from '../components/pos/ProductGrid';
import CartBar from '../components/pos/CartBar';
import SizePickerSheet, {
  type POSProduct,
  type CartLineInput,
} from '../components/pos/SizePickerSheet';
import CartSheet, {
  type CartLine,
  type SalePayload,
} from '../components/pos/CartSheet';
import SaleSuccessScreen, { type CompletedSale as SaleSuccessCompletedSale } from '../components/pos/SaleSuccessScreen';

interface POSPageProps {
  apiBaseUrl?: string;
}

export interface CompletedSale extends SalePayload {
  receiptId?: string;
  saleId?: string;
  completedAt?: string;
}

function buildCartKey(productId: string, sizeCode: string | null): string {
  return `${productId}__${sizeCode ?? 'NA'}`;
}

function fmt(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type ToastType = 'ok' | 'warn' | 'err';

function useToast() {
  const [toast, setToast] = useState<{ message: string; id: number; type: ToastType } | null>(null);
  const show = useCallback((message: string, type: ToastType = 'ok') => {
    const id = Date.now();
    setToast({ message, id, type });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), type === 'warn' ? 5000 : 3000);
  }, []);
  return { toast, show };
}

export default function POSPage({ apiBaseUrl: _ignored }: POSPageProps) {
  const { currentWarehouse, warehouses, currentWarehouseId } = useWarehouse();
  const { user, tryRefreshSession } = useAuth();
  const triedRefreshRef = useRef(false);

  const warehouse: Warehouse = currentWarehouse ?? {
    id: currentWarehouseId,
    name: 'Loading...',
    code: '',
  };

  /** POS never shows location selection; warehouse comes from auth (cashier) or context only. */

  // If cashier landed on POS without warehouseId (e.g. stale session), try to refresh session once so /api/auth/user enriches it.
  useEffect(() => {
    if (triedRefreshRef.current || !user) return;
    const isCashier = (user.role ?? '').toString().toLowerCase() === 'cashier';
    if (!isCashier || user.warehouseId) return;
    triedRefreshRef.current = true;
    tryRefreshSession();
  }, [user, tryRefreshSession]);
  const [products, setProducts] = useState<POSProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<POSProduct | null>(null);
  const [saleResult, setSaleResult] = useState<CompletedSale | null>(null);
  const [charging, setCharging] = useState(false);

  const { toast, show: showToast } = useToast();
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const apiFetch = useCallback(
    async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      const callerSignal = init?.signal;
      if (callerSignal) {
        if (callerSignal.aborted) {
          clearTimeout(timeout);
          throw new DOMException('Aborted', 'AbortError');
        }
        callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      try {
        const res = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: new Headers({
            ...getApiHeaders(),
            ...(init?.headers
              ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
              : {}),
          }),
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
          if (res.status === 401) onUnauthorized();
          const body = await res.json().catch(() => ({}));
          const msg =
            (body as { message?: string; error?: string }).message ??
            (body as { message?: string; error?: string }).error ??
            `HTTP ${res.status}`;
          const err = new Error(msg) as Error & { status?: number };
          err.status = res.status;
          throw err;
        }
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      } catch (e: unknown) {
        clearTimeout(timeout);
        if (e instanceof Error && e.name === 'AbortError') throw new Error('Request timed out');
        throw e;
      }
    },
    []
  );

  const loadProductsAbortRef = useRef<AbortController | null>(null);
  const productsCacheRef = useRef<{ wid: string; list: POSProduct[]; at: number } | null>(null);
  const PRODUCTS_CACHE_TTL_MS = 30_000;

  const loadProducts = useCallback(
    async (wid: string, silent = false, signal?: AbortSignal) => {
      const cached = productsCacheRef.current;
      if (cached?.wid === wid && Date.now() - cached.at < PRODUCTS_CACHE_TTL_MS && cached.list.length >= 0) {
        if (isMounted.current) {
          setProducts(cached.list);
          setProductsLoadError(null);
        }
        if (!silent) setLoading(false);
        const revalidate = await apiFetch<
          POSProduct[] | { data?: POSProduct[]; products?: POSProduct[] }
        >(`/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=1000`, { signal }).catch(() => null);
        if (signal?.aborted || !isMounted.current) return;
        if (revalidate != null) {
          const rawList: POSProduct[] = Array.isArray(revalidate)
            ? revalidate
            : (revalidate as { data?: POSProduct[] }).data ?? (revalidate as { products?: POSProduct[] }).products ?? [];
          const list = rawList.map((item) => {
            const row = item as unknown as { color?: string; variants?: { color?: string }; barcode?: string | null };
            const color = (row.color != null ? String(row.color).trim() : '') || (row.variants?.color ?? '') || '';
            return { ...item, color: color || null, barcode: row.barcode != null ? String(row.barcode) : null };
          });
          productsCacheRef.current = { wid, list, at: Date.now() };
          setProducts(list);
        }
        return;
      }
      if (!silent) {
        setLoading(true);
        setProductsLoadError(null);
      }
      try {
        const data = await apiFetch<
          POSProduct[] | { data?: POSProduct[]; products?: POSProduct[] }
        >(`/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=1000`, { signal });
        if (signal?.aborted) return;
        const rawList: POSProduct[] = Array.isArray(data)
          ? data
          : (data as { data?: POSProduct[] }).data ??
            (data as { products?: POSProduct[] }).products ??
            [];
        const list: POSProduct[] = rawList.map((item) => {
          const row = item as unknown as { color?: string; variants?: { color?: string }; barcode?: string | null };
          const color =
            (row.color != null ? String(row.color).trim() : '') ||
            (row.variants?.color ?? '') ||
            '';
          return {
            ...item,
            color: color || null,
            barcode: row.barcode != null ? String(row.barcode) : null,
          };
        });
        if (isMounted.current) {
          productsCacheRef.current = { wid, list, at: Date.now() };
          setProducts(list);
          setProductsLoadError(null);
        }
      } catch (e: unknown) {
        if (signal?.aborted) return;
        const message = e instanceof Error ? e.message : 'Failed to load products';
        if (!silent && isMounted.current) {
          setProductsLoadError(message);
          showToast(message, 'err');
        }
      } finally {
        if (!silent && isMounted.current) setLoading(false);
      }
    },
    [apiFetch, showToast]
  );

  useEffect(() => {
    const wid = warehouse.id?.trim();
    if (!wid) return;
    loadProductsAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadProductsAbortRef.current = ctrl;
    setCart([]);
    setSearch('');
    setCategory('all');
    setSizeFilter('');
    setColorFilter('');
    loadProducts(wid, false, ctrl.signal);
    return () => {
      ctrl.abort();
      if (loadProductsAbortRef.current === ctrl) loadProductsAbortRef.current = null;
    };
  }, [warehouse.id, loadProducts]);

  function handleBarcodeSubmit() {
    const raw = search.trim();
    if (!raw) return;
    setSearch('');
    const matches = products.filter(
      (p) => (p.barcode ?? '').trim().toLowerCase() === raw.toLowerCase()
    );
    if (matches.length === 0) {
      showToast('Product not found for this barcode', 'err');
      return;
    }
    const product = matches[0];
    const isSized = product.sizeKind === 'sized' && (product.quantityBySize?.length ?? 0) > 0;
    if (isSized) {
      setActiveProduct(structuredClone(product));
    } else {
      handleAddToCart({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sizeCode: null,
        sizeLabel: null,
        unitPrice: product.sellingPrice,
        qty: 1,
        imageUrl: product.images?.[0] ?? null,
      });
    }
    if (matches.length > 1) {
      showToast('Multiple products match; added first', 'warn');
    }
  }

  function handleAddToCart(input: CartLineInput) {
    const key = buildCartKey(input.productId, input.sizeCode ?? null);
    setCart((prev) => {
      const exists = prev.find((l) => l.key === key);
      if (exists)
        return prev.map((l) =>
          l.key === key ? { ...l, qty: l.qty + input.qty } : l
        );
      return [
        ...prev,
        {
          key,
          productId: input.productId,
          name: input.name,
          sku: input.sku ?? '',
          sizeCode: input.sizeCode ?? null,
          sizeLabel: input.sizeLabel ?? null,
          unitPrice: input.unitPrice,
          qty: input.qty,
          imageUrl: input.imageUrl ?? null,
        },
      ];
    });
    showToast(
      `${input.name}${input.sizeLabel ? ` · ${input.sizeLabel}` : ''} added`
    );
  }

  function handleUpdateQty(key: string, delta: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l
      )
    );
  }

  function handleRemoveLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function handleClearCart() {
    setCart([]);
    setCartOpen(false);
  }

  async function handleCharge(payload: SalePayload) {
    if (charging) return;
    setCharging(true);

    let serverSaleId: string | undefined;
    let serverReceiptId: string | undefined;
    let completedAt: string | undefined;
    const syncOk = true;

    const idempotencyKey = `pos-${payload.warehouseId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const result = await apiFetch<{
        id: string;
        receiptId: string;
        total?: number;
        itemCount?: number;
        status?: string;
        createdAt: string;
      }>('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          warehouseId: payload.warehouseId,
          customerName: payload.customerName || null,
          paymentMethod: payload.paymentMethod,
          subtotal: payload.subtotal,
          discountPct: payload.discountPct,
          discountAmt: payload.discountAmt,
          total: payload.total,
          lines: payload.lines.map((l) => ({
            productId: l.productId,
            sizeCode: l.sizeCode || null,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.unitPrice * l.qty,
            name: l.name,
            sku: l.sku ?? '',
            imageUrl: l.imageUrl ?? null,
          })),
        }),
      });

      serverSaleId = result.id;
      serverReceiptId = result.receiptId;
      completedAt = result.createdAt ?? new Date().toISOString();
    } catch (apiErr: unknown) {
      const status = (apiErr as { status?: number })?.status;
      if (status === 409) {
        setCharging(false);
        showToast('Insufficient stock for one or more items. Adjust the cart and try again.', 'err');
        return;
      }
      console.error(
        '[POS] /api/sales failed — stock NOT deducted in DB:',
        apiErr instanceof Error ? apiErr.message : apiErr
      );
      setCharging(false);
      showToast(
        "Sale didn't reach the server. Check your connection and tap Charge again.",
        'warn'
      );
      return;
    }

    setProducts((prev) =>
      prev.map((p) => {
        const saleLines = payload.lines.filter((l) => l.productId === p.id);
        if (saleLines.length === 0) return p;

        if (p.sizeKind === 'sized') {
          const updatedSizes = (p.quantityBySize ?? []).map((row) => {
            const line = saleLines.find(
              (l) =>
                l.sizeCode &&
                row.sizeCode &&
                l.sizeCode.toUpperCase() === row.sizeCode.toUpperCase()
            );
            return line
              ? { ...row, quantity: Math.max(0, row.quantity - line.qty) }
              : row;
          });
          return {
            ...p,
            quantityBySize: updatedSizes,
            quantity: updatedSizes.reduce((s, r) => s + r.quantity, 0),
          };
        }

        const totalSold = saleLines.reduce((s, l) => s + l.qty, 0);
        return { ...p, quantity: Math.max(0, p.quantity - totalSold) };
      })
    );

    setCart([]);
    setCartOpen(false);
    setCharging(false);

    await new Promise((r) => setTimeout(r, 350));

    if (!isMounted.current) return;

    setSaleResult({
      ...payload,
      saleId: serverSaleId,
      receiptId: serverReceiptId,
      completedAt,
      lines: payload.lines.map((l) => ({
        ...l,
        key: buildCartKey(l.productId, l.sizeCode ?? null),
      })),
    });

    if (!syncOk) {
      setTimeout(() => {
        showToast('⚠ Not synced — deploy /api/sales route', 'warn');
      }, 600);
    }
  }

  function handleNewSale() {
    setSaleResult(null);
    setCart([]);
    loadProducts(warehouse.id, true);
  }

  function handleShareReceipt(sale: SaleSuccessCompletedSale) {
    const lines = sale.lines
      .map(
        (l) =>
          `${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''} x${l.qty} — ${fmt(l.unitPrice * l.qty)}`
      )
      .join('\n');

    const text = [
      '🧾 Receipt — Extreme Dept Kidz',
      sale.receiptId ? sale.receiptId : '',
      '─────────────────────',
      lines,
      '─────────────────────',
      (sale.discountPct ?? 0) > 0 ? `Discount: −${fmt(sale.discountAmt ?? 0)}` : null,
      `Total: ${fmt(sale.total)}`,
      `Paid via: ${sale.paymentMethod}`,
      sale.customerName ? `Customer: ${sale.customerName}` : null,
      `Date: ${formatReceiptDate(sale.completedAt ?? undefined)}`,
    ]
      .filter(Boolean)
      .join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Receipt', text }).catch(() => {});
    } else {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  }

  function handlePrintReceipt(sale: SaleSuccessCompletedSale) {
    printReceipt({
      receiptId: sale.receiptId,
      lines: sale.lines.map((l) => ({
        name: l.name,
        sizeLabel: l.sizeLabel ?? undefined,
        qty: l.qty,
        unitPrice: l.unitPrice,
      })),
      subtotal: sale.subtotal ?? sale.total,
      discountPct: sale.discountPct,
      discountAmt: sale.discountAmt,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      customerName: sale.customerName,
      completedAt: sale.completedAt,
    });
  }

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const toastBorder =
    toast?.type === 'warn'
      ? 'border-l-amber-400'
      : toast?.type === 'err'
        ? 'border-l-red-500'
        : 'border-l-emerald-500';

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const total = subtotal;

  return (
    <div className="min-h-screen bg-[var(--edk-bg)] flex flex-col overflow-hidden">
      <POSHeader
        warehouseName={warehouse.name}
        search={search}
        cartCount={cartCount}
        onSearchChange={setSearch}
        onCartTap={() => cartCount > 0 && setCartOpen(true)}
        onBarcodeSubmit={handleBarcodeSubmit}
      />

      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[1fr_340px] min-h-0 overflow-hidden">
        {/* Products panel: on mobile add bottom padding for sticky CartBar */}
        <div className="flex-1 overflow-y-auto min-h-0 pb-20 lg:pb-0">
          {productsLoadError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-[var(--edk-ink-2)] font-medium">Cannot load products</p>
              <p className="text-sm text-[var(--edk-ink-3)] max-w-md">{productsLoadError}</p>
              <button
                type="button"
                onClick={() => {
                  setProductsLoadError(null);
                  if (warehouse.id) loadProducts(warehouse.id);
                }}
                className="rounded-lg bg-[var(--edk-red)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--edk-red-hover)]"
              >
                Retry
              </button>
            </div>
          ) : (
            <ProductGrid
              products={products}
              loading={loading}
              search={search}
              category={category}
              sizeFilter={sizeFilter}
              colorFilter={colorFilter}
              onSelect={(product) => setActiveProduct(structuredClone(product))}
              onClearSearch={() => setSearch('')}
              onCategoryChange={setCategory}
              onSizeFilterChange={setSizeFilter}
              onColorFilterChange={setColorFilter}
            />
          )}
        </div>

        {/* Cart panel (desktop): 340px fixed right */}
        <aside className="hidden lg:flex flex-col border-l border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-0">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--edk-border)]">
            <span className="text-[14px] font-extrabold uppercase tracking-wide text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Current Sale
            </span>
            <button
              type="button"
              onClick={handleClearCart}
              className="text-[11px] font-medium text-[var(--edk-ink-3)] px-2 py-1 rounded border border-[var(--edk-border-mid)] hover:bg-[var(--edk-bg)]"
            >
              Clear all
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 p-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 gap-2 text-[var(--edk-ink-3)]">
                <div className="w-12 h-12 rounded-full bg-[var(--edk-bg)] flex items-center justify-center mb-1">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                  </svg>
                </div>
                <p className="text-[13px] font-semibold text-[var(--edk-ink-2)]">Cart is empty</p>
                <p className="text-[12px] text-center">Tap a product to add it</p>
              </div>
            ) : (
              <ul className="space-y-1">
                {cart.map((l) => (
                  <li key={l.key} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--edk-bg)]">
                    <div className="w-10 h-10 rounded-[var(--edk-radius-sm)] bg-[var(--edk-bg)] border border-[var(--edk-border)] flex-shrink-0 overflow-hidden">
                      {l.imageUrl ? <img src={l.imageUrl} alt="" className="w-full h-full object-cover" /> : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold truncate">{l.name}</p>
                      <p className="text-[10px] text-[var(--edk-ink-3)]">{l.sizeLabel ?? '—'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[14px] font-extrabold text-[var(--edk-red)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(l.unitPrice * l.qty)}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => handleUpdateQty(l.key, -1)} className="w-[22px] h-[22px] rounded flex items-center justify-center border border-[var(--edk-border-mid)] bg-[var(--edk-bg)] text-[var(--edk-ink-2)] font-semibold">−</button>
                        <span className="text-[12px] font-semibold min-w-[14px] text-center">{l.qty}</span>
                        <button type="button" onClick={() => handleUpdateQty(l.key, 1)} className="w-[22px] h-[22px] rounded flex items-center justify-center border border-[var(--edk-border-mid)] bg-[var(--edk-bg)] text-[var(--edk-ink-2)] font-semibold">+</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {cart.length > 0 && (
            <div className="p-4 border-t border-[var(--edk-border)] flex flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--edk-ink-3)]">Subtotal ({cartCount} items)</span>
                  <span className="font-medium text-[var(--edk-ink-2)]">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--edk-ink-3)]">Discount</span>
                  <span className="font-medium text-[var(--edk-green)]">−{fmt(0)}</span>
                </div>
                <div className="h-px bg-[var(--edk-border)] my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-[13px] font-semibold text-[var(--edk-ink)]">Total</span>
                  <span className="text-[20px] font-extrabold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{fmt(total)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                className="w-full h-11 rounded-[var(--edk-radius-sm)] bg-[var(--edk-red)] hover:bg-[var(--edk-red-hover)] text-white text-[14px] font-bold flex items-center justify-center gap-2 shadow-[0_2px_6px_rgba(232,40,26,0.3)]"
              >
                Charge {fmt(total)}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <div className="flex gap-1.5">
                <button type="button" className="flex-1 h-8 rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-bg)] text-[11px] font-medium text-[var(--edk-ink-2)]">
                  + Discount
                </button>
                <button type="button" className="flex-1 h-8 rounded-[var(--edk-radius-sm)] border border-[var(--edk-border-mid)] bg-[var(--edk-bg)] text-[11px] font-medium text-[var(--edk-ink-2)]">
                  Hold Sale
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <CartBar lines={cart} onOpen={() => cartCount > 0 && setCartOpen(true)} />

      <SizePickerSheet
        product={activeProduct}
        onAdd={handleAddToCart}
        onClose={() => setActiveProduct(null)}
      />

      <CartSheet
        isOpen={cartOpen}
        lines={cart}
        warehouseId={warehouse?.id ?? currentWarehouseId ?? warehouses[0]?.id ?? ''}
        onUpdateQty={handleUpdateQty}
        onRemoveLine={handleRemoveLine}
        onClearCart={handleClearCart}
        onCharge={handleCharge}
        onClose={() => !charging && setCartOpen(false)}
      />

      <SaleSuccessScreen
        sale={saleResult}
        onNewSale={handleNewSale}
        onPrint={handlePrintReceipt}
        onShareReceipt={handleShareReceipt}
      />

      {toast && (
        <div
          key={toast.id}
          className={`
          fixed bottom-24 left-1/2 -translate-x-1/2 z-40
          px-4 py-2.5 rounded-full
          bg-slate-900 text-white text-[13px] font-semibold
          shadow-[0_4px_20px_rgba(0,0,0,0.25)]
          whitespace-nowrap pointer-events-none
          border-l-[3px] ${toastBorder}
          animate-[posToastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
        `}
        >
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes posToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
