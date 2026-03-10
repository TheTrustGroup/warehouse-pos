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
// POS is server-only: no offline queue or local storage. Sales go to POST /api/sales (Supabase).
// If POST /api/sales fails or device is offline → toast + rollback; sale is not completed.
// ============================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { getApiHeaders, API_BASE_URL } from '../lib/api';
import { resetAllApiCircuitBreakers } from '../lib/circuit';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { getProductImageDisplayUrl } from '../lib/imageUpload';
import { isValidWarehouseId } from '../lib/warehouseId';
import { normalizeQuantityBySize } from '../lib/utils';
import { onUnauthorized } from '../lib/onUnauthorized';
import { printReceipt, formatReceiptDate } from '../lib/printReceipt';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useAuth } from '../contexts/AuthContext';
import { useInventory } from '../contexts/InventoryContext';
import { usePresence } from '../contexts/PresenceContext';
import type { Product } from '../types';

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
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { BRAND } from '../config/branding';

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

/** Remaining stock for (productId, sizeCode) after subtracting cart qty and optional extra. Used for low-stock broadcast (NEXT 4). */
function getRemainingForProduct(
  products: POSProduct[],
  cart: CartLine[],
  productId: string,
  sizeCode: string | null,
  extraQty = 0
): number {
  const p = products.find((x) => x.id === productId);
  if (!p) return 0;
  const key = buildCartKey(productId, sizeCode);
  const inCart = cart.find((l) => l.key === key)?.qty ?? 0;
  const totalInCart = inCart + extraQty;
  if (p.sizeKind === 'sized' && sizeCode) {
    const row = p.quantityBySize?.find(
      (r) => r.sizeCode?.toUpperCase() === (sizeCode ?? '').toUpperCase()
    );
    return Math.max(0, (row?.quantity ?? 0) - totalInCart);
  }
  return Math.max(0, (p.quantity ?? 0) - totalInCart);
}

const LOW_STOCK_BROADCAST_THRESHOLD = 3;
const LOW_STOCK_BROADCAST_THROTTLE_MS = 60_000; // same product/size at most once per minute

/** Apply sale lines deduction to a products list (pure, for optimistic apply and rollback). */
function applySaleDeduction(
  products: POSProduct[],
  lines: SalePayload['lines']
): POSProduct[] {
  return products.map((p) => {
    const saleLines = lines.filter((l) => l.productId === p.id);
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
  });
}

/** Map InventoryContext Product to POSProduct so POS can show immediately when phase-2 or cache already has data. */
function productToPOSProduct(p: Product): POSProduct {
  const color =
    (p.variants?.color != null ? String(p.variants.color).trim() : '') || null;
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    sizeKind: p.sizeKind ?? 'na',
    quantity: Number(p.quantity) ?? 0,
    quantityBySize: p.quantityBySize ?? undefined,
    sellingPrice: Number(p.sellingPrice) ?? 0,
    category: p.category ?? undefined,
    images: Array.isArray(p.images) ? p.images : [],
    color: color || undefined,
    barcode: p.barcode != null ? String(p.barcode) : null,
  };
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
  const queryClient = useQueryClient();
  const { currentWarehouse, currentWarehouseId, loadError: warehouseLoadError, refreshWarehouses } = useWarehouse();
  const { user, tryRefreshSession } = useAuth();
  const { products: inventoryProducts } = useInventory();
  const triedRefreshRef = useRef(false);

  // Defensive: context can be empty before first load; avoid .length/.map on undefined.
  const safeInventoryProducts = Array.isArray(inventoryProducts) ? inventoryProducts : [];

  const warehouse: Warehouse = currentWarehouse ?? {
    id: currentWarehouseId,
    name: 'Loading...',
    code: '',
  };
  /** Only use warehouse ID from context; never fall back to first in list (could be placeholder). */
  const warehouseId = (warehouse?.id ?? currentWarehouseId ?? '').trim();
  const isWarehouseLoaded = isValidWarehouseId(warehouseId);

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
  const { sendLowStockAlert, receivedLowStockAlerts, dismissLowStockAlert } = usePresence();
  const safeReceivedLowStockAlerts = Array.isArray(receivedLowStockAlerts) ? receivedLowStockAlerts : [];
  const isMounted = useRef(true);
  const lastLowStockBroadcastRef = useRef<{ key: string; at: number } | null>(null);

  /** Zero-latency barcode lookup (no API, no filter over array). Critical for scanner flow. */
  const barcodeToProduct = useMemo(() => {
    const map = new Map<string, POSProduct>();
    for (const p of products) {
      const b = (p.barcode ?? '').trim();
      if (b && !map.has(b.toLowerCase())) map.set(b.toLowerCase(), p);
    }
    return map;
  }, [products]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  /** Timeout high enough for serverless cold start + products DB (avoids "connection lost" on slow first load). */
  const API_FETCH_TIMEOUT_MS = 40_000;
  const apiFetch = useCallback(
    async <T = unknown>(path: string, init?: RequestInit): Promise<T> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), API_FETCH_TIMEOUT_MS);
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
          const b = body as { message?: string; error?: string; detail?: string };
          const msg = b.message ?? b.error ?? `HTTP ${res.status}`;
          const err = new Error(msg) as Error & { status?: number; detail?: string };
          err.status = res.status;
          err.detail = b.detail;
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
  /** First page smaller so request completes before timeout (cold start); then 250 per page. */
  const PRODUCTS_FIRST_PAGE_LIMIT = 250;
  const PRODUCTS_PAGE_LIMIT = 250;

  function normalizeProductItem(item: unknown): POSProduct {
    const row = item as unknown as {
      color?: string;
      variants?: { color?: string };
      barcode?: string | null;
      quantityBySize?: unknown;
      quantity_by_size?: unknown;
      sizeKind?: string;
      size_kind?: string;
    };
    const color = (row.color != null ? String(row.color).trim() : '') || (row.variants?.color ?? '') || '';
    const rawSizes = row.quantityBySize ?? row.quantity_by_size;
    const quantityBySize = normalizeQuantityBySize(rawSizes);
    const base = item as POSProduct;
    return {
      ...base,
      color: color || null,
      barcode: row.barcode != null ? String(row.barcode) : null,
      sizeKind: (row.sizeKind ?? row.size_kind ?? base.sizeKind) as 'na' | 'one_size' | 'sized' | undefined,
      quantityBySize: quantityBySize.length > 0 ? quantityBySize : base.quantityBySize,
    };
  }

  const loadProducts = useCallback(
    async (wid: string, silent = false, signal?: AbortSignal) => {
      const cached = productsCacheRef.current;
      if (cached?.wid === wid && Date.now() - cached.at < PRODUCTS_CACHE_TTL_MS && cached.list.length >= 0) {
        if (isMounted.current) {
          setProducts(cached.list);
          setProductsLoadError(null);
        }
        if (!silent) setLoading(false);
        const allPages: POSProduct[] = [];
        let totalFromApi: number | undefined;
        let offset = 0;
        let pageLimit = PRODUCTS_FIRST_PAGE_LIMIT;
        while (true) {
          if (signal?.aborted || !isMounted.current) return;
          const revalidate = await apiFetch<
            POSProduct[] | { data?: POSProduct[]; products?: POSProduct[]; total?: number }
          >(
            `/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=${pageLimit}&offset=${Number(offset) || 0}`,
            { signal }
          ).catch(() => null);
          if (signal?.aborted || !isMounted.current) return;
          if (revalidate == null) break;
          const rawList: POSProduct[] = Array.isArray(revalidate)
            ? revalidate
            : (revalidate as { data?: POSProduct[] }).data ?? (revalidate as { products?: POSProduct[] }).products ?? [];
          if (typeof (revalidate as { total?: number }).total === 'number') totalFromApi = (revalidate as { total: number }).total;
          const page = rawList.map((item) => normalizeProductItem(item));
          allPages.push(...page);
          if (page.length < pageLimit || (typeof totalFromApi === 'number' && allPages.length >= totalFromApi)) break;
          offset += page.length;
          pageLimit = PRODUCTS_PAGE_LIMIT;
        }
        if (allPages.length > 0) {
          productsCacheRef.current = { wid, list: allPages, at: Date.now() };
          if (isMounted.current) setProducts(allPages);
        }
        return;
      }
      if (!silent) {
        setLoading(true);
        setProductsLoadError(null);
      }
      try {
        const allPages: POSProduct[] = [];
        let totalFromApi: number | undefined;
        let offset = 0;
        let pageLimit = PRODUCTS_FIRST_PAGE_LIMIT;
        while (true) {
          if (signal?.aborted) return;
          const data = await apiFetch<
            POSProduct[] | { data?: POSProduct[]; products?: POSProduct[]; total?: number }
          >(
            `/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=${pageLimit}&offset=${Number(offset) || 0}`,
            { signal }
          );
          if (signal?.aborted) return;
          const rawList: POSProduct[] = Array.isArray(data)
            ? data
            : (data as { data?: POSProduct[] }).data ?? (data as { products?: POSProduct[] }).products ?? [];
          if (typeof (data as { total?: number }).total === 'number') totalFromApi = (data as { total: number }).total;
          const page = rawList.map((item) => normalizeProductItem(item));
          allPages.push(...page);
          if (page.length < pageLimit || (typeof totalFromApi === 'number' && allPages.length >= totalFromApi)) break;
          offset += page.length;
          pageLimit = PRODUCTS_PAGE_LIMIT;
        }
        if (isMounted.current) {
          productsCacheRef.current = { wid, list: allPages, at: Date.now() };
          setProducts(allPages);
          setProductsLoadError(null);
        }
      } catch (e: unknown) {
        if (signal?.aborted) return;
        let message: string;
        try {
          message = getUserFriendlyMessage(e);
        } catch {
          message = 'Connection problem. Check your network and try again.';
        }
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

  // P3#19: When user returns to the tab, invalidate product cache so next read gets fresh stock.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isValidWarehouseId(warehouse.id)) {
        productsCacheRef.current = null;
        loadProducts(warehouse.id, true).catch(() => {
          // Never let background revalidate crash the app; error state already shown if needed.
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [warehouse.id, loadProducts]);

  useEffect(() => {
    const wid = warehouse.id?.trim();
    if (!wid || !isValidWarehouseId(wid)) return;
    loadProductsAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadProductsAbortRef.current = ctrl;
    setCart([]);
    setSearch('');
    setCategory('all');
    setSizeFilter('');
    setColorFilter('');
    // While sale-success screen is showing, do not overwrite products from context: refetch may fail
    // ("network connection lost") and context could be stale or wrong; keep optimistic post-sale list.
    if (saleResult != null) {
      loadProducts(wid, true, ctrl.signal).catch(() => {
        if (isMounted.current) setLoading(false);
      });
      return () => {
        ctrl.abort();
        if (loadProductsAbortRef.current === ctrl) loadProductsAbortRef.current = null;
      };
    }
    // Always load POS product list with limit 250 so full catalog shows. Do not reuse InventoryContext
    // (context only has 50 initially), otherwise POS would show "50 of 50" when there are 200+ products.
    loadProducts(wid, false, ctrl.signal).catch(() => {
      if (isMounted.current) setLoading(false);
    });
    return () => {
      ctrl.abort();
      if (loadProductsAbortRef.current === ctrl) loadProductsAbortRef.current = null;
    };
  }, [warehouse.id, loadProducts, saleResult]);

  // NEXT 4: show toast when another cashier broadcasts low-stock, then dismiss
  const processedAlertCountRef = useRef(0);
  useEffect(() => {
    const list = safeReceivedLowStockAlerts;
    if (list.length <= processedAlertCountRef.current) return;
    for (let i = processedAlertCountRef.current; i < list.length; i++) {
      const a = list[i];
      const sizePart = a.sizeLabel ?? a.sizeCode ?? '';
      const msg = sizePart
        ? `⚠️ ${a.senderName} is also selling ${a.productName} · ${sizePart} (${a.remaining} remaining)`
        : `⚠️ ${a.senderName} is also selling ${a.productName} (${a.remaining} remaining)`;
      showToast(msg, 'warn');
      dismissLowStockAlert(a.id);
    }
    processedAlertCountRef.current = list.length;
  }, [safeReceivedLowStockAlerts, showToast, dismissLowStockAlert]);

  type SaleMutationVars = {
    payload: SalePayload;
    cartSnapshot: CartLine[];
    productsSnapshot: POSProduct[];
  };

  type SaleMutationResult = {
    id: string;
    receiptId: string;
    total?: number;
    itemCount?: number;
    status?: string;
    createdAt: string;
  };

  const saleMutation = useMutation({
    mutationFn: async ({ payload }: SaleMutationVars): Promise<SaleMutationResult> => {
      if (!isValidWarehouseId(payload.warehouseId)) {
        throw new Error('Warehouse not loaded. Please wait and try again.');
      }
      const idempotencyKey = `pos-${payload.warehouseId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const result = await apiFetch<SaleMutationResult>('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          warehouseId: payload.warehouseId,
          customerName: payload.customerName || null,
          customerEmail: payload.customerEmail || null,
          paymentMethod: payload.paymentMethod,
          payments: payload.payments ?? null,
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
          deliverySchedule: payload.deliverySchedule ?? null,
        }),
      });
      return result;
    },
    onMutate: async ({ payload, cartSnapshot, productsSnapshot }: SaleMutationVars) => {
      const previousProducts = productsSnapshot;
      const previousCart = cartSnapshot;
      setProducts(applySaleDeduction(productsSnapshot, payload.lines));
      setCart([]);
      setCartOpen(false);
      await new Promise((r) => setTimeout(r, 50));
      if (!isMounted.current) return { previousCart, previousProducts };
      setSaleResult({
        ...payload,
        saleId: undefined,
        receiptId: 'Pending…',
        completedAt: new Date().toISOString(),
        lines: payload.lines.map((l) => ({
          ...l,
          key: buildCartKey(l.productId, l.sizeCode ?? null),
        })),
      });
      return { previousCart, previousProducts };
    },
    onError: (err: unknown, _vars: SaleMutationVars, context: { previousCart: CartLine[]; previousProducts: POSProduct[] } | undefined) => {
      if (isMounted.current) setCharging(false);
      const status = (err as { status?: number })?.status;
      const message = (err as Error)?.message ?? '';
      const detail = (err as { detail?: string })?.detail;
      if (context && Array.isArray(context.previousProducts)) {
        setProducts(context.previousProducts);
      }
      if (context && Array.isArray(context.previousCart)) {
        setCart(context.previousCart);
      }
      setSaleResult(null);
      if (status === 409 || status === 422) {
        showToast('Insufficient stock for one or more items. Adjust the cart and try again.', 'err');
      } else       if (status === 401) {
        showToast('Session expired. Please log in again.', 'err');
      } else if (status === 404) {
        showToast('Sales API not found. Ensure the backend is deployed and VITE_API_BASE_URL points to it.', 'warn');
      } else if (message.includes('timed out') || /fetch|network|load failed/i.test(message)) {
        showToast("Can't reach the server. Check your connection and tap Charge again.", 'warn');
      } else if (status === 500 && (detail || message) && message !== `HTTP ${status}`) {
        showToast(detail ? `Sale failed: ${detail}` : message, 'err');
      } else {
        console.error('[POS] /api/sales failed — rolled back optimistic sale:', err);
        showToast(
          "Sale didn't reach the server. Check your connection and tap Charge again.",
          'warn'
        );
      }
    },
    onSuccess: (result, _vars: SaleMutationVars) => {
      if (isMounted.current) setCharging(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      productsCacheRef.current = null;
      if (isValidWarehouseId(warehouse.id)) loadProducts(warehouse.id, true);
      if (!isMounted.current) return;
      setSaleResult((prev) =>
        prev
          ? {
              ...prev,
              saleId: result.id,
              receiptId: result.receiptId,
              completedAt: result.createdAt ?? new Date().toISOString(),
            }
          : null
      );
    },
  });

  function handleBarcodeSubmit() {
    const raw = search.trim();
    if (!raw) return;
    setSearch('');
    const product = barcodeToProduct.get(raw.toLowerCase());
    if (!product) {
      showToast('Product not found for this barcode', 'err');
      return;
    }
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
    const remaining = getRemainingForProduct(
      products,
      cart,
      input.productId,
      input.sizeCode ?? null,
      input.qty
    );
    if (remaining <= LOW_STOCK_BROADCAST_THRESHOLD) {
      const broadcastKey = buildCartKey(input.productId, input.sizeCode ?? null);
      const now = Date.now();
      const last = lastLowStockBroadcastRef.current;
      if (!last || last.key !== broadcastKey || now - last.at > LOW_STOCK_BROADCAST_THROTTLE_MS) {
        lastLowStockBroadcastRef.current = { key: broadcastKey, at: now };
        sendLowStockAlert({
          productName: input.name,
          sizeCode: input.sizeCode ?? null,
          sizeLabel: input.sizeLabel ?? null,
          remaining,
          productId: input.productId,
        });
      }
    }
  }

  function handleUpdateQty(key: string, delta: number) {
    const line = cart.find((l) => l.key === key);
    setCart((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l
      )
    );
    if (delta > 0 && line) {
      const remaining = getRemainingForProduct(
        products,
        cart,
        line.productId,
        line.sizeCode ?? null,
        delta
      );
      if (remaining <= LOW_STOCK_BROADCAST_THRESHOLD) {
        const broadcastKey = buildCartKey(line.productId, line.sizeCode ?? null);
        const now = Date.now();
        const last = lastLowStockBroadcastRef.current;
        if (!last || last.key !== broadcastKey || now - last.at > LOW_STOCK_BROADCAST_THROTTLE_MS) {
          lastLowStockBroadcastRef.current = { key: broadcastKey, at: now };
          sendLowStockAlert({
            productName: line.name,
            sizeCode: line.sizeCode ?? null,
            sizeLabel: line.sizeLabel ?? null,
            remaining,
            productId: line.productId,
          });
        }
      }
    }
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
    if (!isValidWarehouseId(payload.warehouseId)) {
      showToast('Warehouse not loaded yet. Please wait.', 'warn');
      return;
    }
    setCharging(true);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCharging(false);
      showToast('You’re offline. Connect to the internet to complete the sale.', 'err');
      return;
    }

    // Pre-sale stock check so we don't sell out-of-stock when mobile data is stale
    try {
      const verifyRes = await apiFetch<{ valid: boolean; conflicts?: Array<{ product_id: string; size_code: string | null; requested: number; available: number }> }>(
        '/api/products/verify-stock',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            warehouse_id: payload.warehouseId,
            items: payload.lines.map((l) => ({
              product_id: l.productId,
              size_code: l.sizeCode ?? undefined,
              quantity: l.qty,
            })),
          }),
        }
      );
      if (!verifyRes.valid && Array.isArray(verifyRes.conflicts) && verifyRes.conflicts.length > 0) {
        const first = verifyRes.conflicts[0];
        const product = products.find((p) => p.id === first.product_id);
        const name = product?.name ?? first.product_id;
        const sizeLabel = first.size_code ? ` - ${first.size_code}` : '';
        showToast(
          `Stock has changed since you added this item. ${name}${sizeLabel}: Only ${first.available} available. Update your cart and try again.`,
          'err'
        );
        setCharging(false);
        return;
      }
    } catch (e) {
      console.warn('[POS] verify-stock failed, proceeding with sale:', e);
      // Proceed with sale; record_sale will still enforce stock server-side
    }

    try {
      await saleMutation.mutateAsync({
        payload,
        cartSnapshot: cart,
        productsSnapshot: products,
      });
    } catch (err) {
      // Mutation already ran onError (toast + rollback); prevent unhandled rejection / error boundary
      const msg = getUserFriendlyMessage(err);
      if (msg && !/sale didn't reach|session expired|insufficient stock|not found|connection/i.test(msg)) {
        showToast(msg, 'err');
      }
    } finally {
      setCharging(false);
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
      `🧾 Receipt — ${BRAND.receiptTitle}`,
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
      payments: sale.payments,
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
          {!isWarehouseLoaded ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              {warehouseLoadError ? (
                <>
                  <p className="text-[var(--edk-ink-2)] font-medium">Could not load warehouse</p>
                  <p className="text-sm text-[var(--edk-ink-3)] max-w-md">{warehouseLoadError}</p>
                  <button
                    type="button"
                    onClick={() => refreshWarehouses()}
                    className="rounded-lg bg-[var(--edk-red)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <LoadingSpinner size="xl" />
                  <p className="uppercase font-bold text-[14px] tracking-[0.08em] m-0" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: 'var(--edk-ink-3)' }}>
                    Loading warehouse…
                  </p>
                  <p className="text-sm text-[var(--edk-ink-3)] mt-0">Location must be set before you can sell.</p>
                </>
              )}
            </div>
          ) : productsLoadError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <p className="text-[var(--edk-ink-2)] font-medium">Cannot load products</p>
              <p className="text-sm text-[var(--edk-ink-3)] max-w-md">{productsLoadError}</p>
              <button
                type="button"
                onClick={() => {
                  resetAllApiCircuitBreakers();
                  setProductsLoadError(null);
                  if (isValidWarehouseId(warehouse.id)) loadProducts(warehouse.id);
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
                      {l.imageUrl ? <img src={getProductImageDisplayUrl(l.imageUrl, { width: 80, height: 80, resize: 'cover' })} alt="" className="w-full h-full object-cover" /> : null}
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
        warehouseId={warehouseId}
        isWarehouseReady={isWarehouseLoaded}
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
