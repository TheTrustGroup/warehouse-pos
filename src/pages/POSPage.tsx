// ============================================================
// POSPage.tsx  —  warehouse-pos/src/pages/POSPage.tsx
//
// Complete POS with world-class stock management:
//
// Checkout flow:
//   1. handleCharge called from CartSheet
//   2. POST /api/sales → calls record_sale RPC on Supabase
//      → atomically: inserts sale + lines + deducts stock in DB
//   3. On API success:
//      - Get real receiptId from server (RCP-2026-NNNNN)
//      - Optimistically deduct stock in local UI (instant feedback)
//      - Clear cart, close sheet, show SaleSuccessScreen
//   4. On API failure:
//      - Cashier still sees success (sale happened in real world)
//      - Warning toast: "Sync issue — sale logged locally"
//      - Local stock still deducted (will resync on next product reload)
//   5. After success screen → "New sale" → reloads products from server
//      (this brings local stock in sync with DB truth)
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiHeaders } from '../lib/api';
import { printReceipt } from '../lib/printReceipt';
import { useAuth } from '../contexts/AuthContext';

import SessionScreen, { type Warehouse }         from '../components/pos/SessionScreen';
import POSHeader                                  from '../components/pos/POSHeader';
import ProductGrid                                from '../components/pos/ProductGrid';
import CartBar                                    from '../components/pos/CartBar';
import SizePickerSheet, { type POSProduct, type CartLineInput }
                                                  from '../components/pos/SizePickerSheet';
import CartSheet, { type CartLine, type SalePayload }
                                                  from '../components/pos/CartSheet';
import SaleSuccessScreen                          from '../components/pos/SaleSuccessScreen';

// ── Constants ──────────────────────────────────────────────────────────────

const WAREHOUSES: Warehouse[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store', code: 'MAIN' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town',  code: 'MAIN_TOWN' },
];

interface POSPageProps { apiBaseUrl?: string; }

// Extends SalePayload with server-assigned fields
export interface CompletedSale extends SalePayload {
  receiptId?: string;   // e.g. RCP-2026-00001  (from server)
  saleId?:    string;   // UUID from DB
  completedAt?: string; // ISO timestamp
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildCartKey(productId: string, sizeCode: string | null) {
  return `${productId}__${sizeCode ?? 'NA'}`;
}

function fmt(n: number) {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Toast hook ─────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; id: number; type: 'ok' | 'warn' | 'err' } | null>(null);
  const show = useCallback((message: string, type: 'ok' | 'warn' | 'err' = 'ok') => {
    const id = Date.now();
    setToast({ message, id, type });
    setTimeout(() => setToast(t => (t?.id === id ? null : t)), 3200);
  }, []);
  return { toast, show };
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function POSPage({ apiBaseUrl = '' }: POSPageProps) {

  const [sessionOpen, setSessionOpen]     = useState(true);
  const [warehouse, setWarehouse]         = useState<Warehouse>(WAREHOUSES[0]);
  const [products, setProducts]           = useState<POSProduct[]>([]);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [category, setCategory]           = useState('all');
  const [cart, setCart]                   = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen]           = useState(false);
  const [activeProduct, setActiveProduct] = useState<POSProduct | null>(null);
  const [saleResult, setSaleResult]       = useState<CompletedSale | null>(null);
  const [charging, setCharging]           = useState(false); // prevents double-tap

  const { toast, show: showToast } = useToast();
  const { tryRefreshSession } = useAuth();
  const isMounted = useRef(true);
  /** When true, loadProducts must not overwrite state (keeps deducted stock until "New sale"). */
  const deductionAppliedRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── API ───────────────────────────────────────────────────────────────────

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: new Headers({
        ...getApiHeaders(),
        ...(init?.headers
          ? Object.fromEntries(new Headers(init.headers as HeadersInit).entries())
          : {}),
      }),
      credentials: 'include',
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // ── Load products ─────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (wid: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiFetch<POSProduct[] | { data?: POSProduct[]; products?: POSProduct[] }>(
        `/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=1000&in_stock=false`
      );
      const raw = Array.isArray(data) ? data : (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).products;
      const list: POSProduct[] = Array.isArray(raw) ? raw : [];
      // Do not overwrite products if we just completed a sale (deduction must stay until "New sale").
      if (isMounted.current && !deductionAppliedRef.current) setProducts(list);
    } catch (e: unknown) {
      if (!silent) showToast(e instanceof Error ? e.message : 'Failed to load products', 'err');
    } finally {
      if (!silent && isMounted.current) setLoading(false);
    }
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionOpen) {
      // Do not refetch after a sale: that would overwrite deducted stock. Only refetch when
      // user explicitly starts a new session (handleWarehouseSelect clears deductionAppliedRef).
      if (deductionAppliedRef.current) return;
      loadProducts(warehouse.id);
      setCart([]);
      setSearch('');
      setCategory('all');
    }
  }, [warehouse.id, sessionOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Session ───────────────────────────────────────────────────────────────

  function handleWarehouseSelect(w: Warehouse) {
    setWarehouse(w);
    setSessionOpen(false);
    // Allow the next effect/load to run so we get fresh products for this warehouse.
    deductionAppliedRef.current = false;
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  function handleAddToCart(input: CartLineInput) {
    const key = buildCartKey(input.productId, input.sizeCode);
    setCart(prev => {
      const exists = prev.find(l => l.key === key);
      if (exists) return prev.map(l => l.key === key ? { ...l, qty: l.qty + input.qty } : l);
      return [...prev, { key, productId: input.productId, name: input.name, sku: input.sku,
        sizeCode: input.sizeCode, sizeLabel: input.sizeLabel, unitPrice: input.unitPrice, qty: input.qty }];
    });
    showToast(`${input.name}${input.sizeLabel ? ` · ${input.sizeLabel}` : ''} added`);
  }

  function handleUpdateQty(key: string, delta: number) {
    setCart(prev => prev.map(l => l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l));
  }

  function handleRemoveLine(key: string) {
    setCart(prev => prev.filter(l => l.key !== key));
  }

  function handleClearCart() {
    setCart([]);
    setCartOpen(false);
  }

  // ── Charge / complete sale ────────────────────────────────────────────────
  //
  // Order of operations:
  //   1. POST /api/sales  → record_sale RPC (atomic: sale + lines + stock deduction in DB)
  //   2. Deduct stock locally (optimistic — instant UI feedback, even if API is slow)
  //   3. Close cart sheet → wait for animation
  //   4. Show success screen with real receiptId from server
  //
  // If step 1 fails:
  //   - Skip receipt ID (generate a local one as fallback)
  //   - Still complete the checkout flow (cashier isn't blocked)
  //   - Show amber warning toast
  //   - Local stock still deducted (corrected on next loadProducts)

  async function handleCharge(payload: SalePayload) {
    if (charging) return; // prevent double-tap
    setCharging(true);

    let serverSaleId:    string | undefined;
    let serverReceiptId: string | undefined;
    let completedAt:     string | undefined;
    let syncWarning = false;

    // ── Step 1: Record sale in DB (stock deducted atomically in Postgres) ──
    const saleBody = {
      warehouseId:   payload.warehouseId,
      customerName:  payload.customerName || null,
      paymentMethod: payload.paymentMethod,
      subtotal:      payload.subtotal,
      discountPct:   payload.discountPct,
      discountAmt:   payload.discountAmt,
      total:         payload.total,
      lines:         payload.lines.map(l => ({
        productId: l.productId,
        sizeCode:  l.sizeCode,
        qty:       l.qty,
        unitPrice: l.unitPrice,
        lineTotal: l.unitPrice * l.qty,
        name:      l.name,
        sku:       l.sku,
      })),
    };

    type SaleResponse = { id: string; receiptId: string; createdAt: string };
    try {
      let result: SaleResponse;
      try {
        result = await apiFetch<SaleResponse>('/api/sales', {
          method: 'POST',
          body: JSON.stringify(saleBody),
        });
      } catch (firstErr: unknown) {
        const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        const is401 = msg.includes('Unauthorized') || msg.includes('401');
        if (is401 && tryRefreshSession) {
          const refreshed = await tryRefreshSession();
          if (refreshed) {
            result = await apiFetch<SaleResponse>('/api/sales', {
              method: 'POST',
              body: JSON.stringify(saleBody),
            });
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      serverSaleId    = result.id;
      serverReceiptId = result.receiptId;
      completedAt     = result.createdAt ?? new Date().toISOString();

    } catch (apiErr: unknown) {
      // DB call failed — log but don't block the cashier
      console.error('[POSPage] /api/sales failed:', apiErr instanceof Error ? apiErr.message : apiErr);
      syncWarning = true;
      // Fallback local receipt ID
      serverReceiptId = 'LOCAL-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      completedAt = new Date().toISOString();
    }

    // ── Step 2: Deduct stock locally (instant UI feedback) ─────────────────
    // Even though the DB already deducted, the frontend needs to update
    // its local products list so the grid shows correct stock immediately.
    // Set ref so any in-flight or later loadProducts() won't overwrite this deduction.
    deductionAppliedRef.current = true;
    setProducts(prev => prev.map(p => {
      const saleLines = payload.lines.filter(l => l.productId === p.id);
      if (saleLines.length === 0) return p;

      if (p.sizeKind === 'sized') {
        const updatedSizes = p.quantityBySize.map(row => {
          const line = saleLines.find(l => l.sizeCode === row.sizeCode);
          return line ? { ...row, quantity: Math.max(0, row.quantity - line.qty) } : row;
        });
        return { ...p, quantityBySize: updatedSizes, quantity: updatedSizes.reduce((s, r) => s + r.quantity, 0) };
      }

      const totalSold = saleLines.reduce((s, l) => s + l.qty, 0);
      return { ...p, quantity: Math.max(0, p.quantity - totalSold) };
    }));

    // ── Step 3: Clear cart + close sheet ───────────────────────────────────
    setCart([]);
    setCartOpen(false);
    setCharging(false);

    // ── Step 4: Wait for sheet close animation then show success screen ────
    await new Promise(r => setTimeout(r, 350));

    if (!isMounted.current) return;

    // Build the completed sale object (payload + server data)
    const completedSale: CompletedSale = {
      ...payload,
      saleId:      serverSaleId,
      receiptId:   serverReceiptId,
      completedAt,
    };

    setSaleResult(completedSale);

    if (syncWarning) {
      showToast('⚠ Sync issue — check connection', 'warn');
    }
  }

  // ── New sale (after success screen) ──────────────────────────────────────

  function handleNewSale() {
    setSaleResult(null);
    setCart([]);
    // Allow the next loadProducts result to apply (server is source of truth after sale).
    deductionAppliedRef.current = false;
    // Re-fetch from server so stock is 100% accurate (DB truth)
    loadProducts(warehouse.id, true);
  }

  // ── Share receipt ─────────────────────────────────────────────────────────

  function handleShareReceipt(sale: CompletedSale) {
    const lines = sale.lines
      .map(l => `${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''} x${l.qty} — ${fmt(l.unitPrice * l.qty)}`)
      .join('\n');

    const text = [
      '🧾 Receipt — Extreme Dept Kidz',
      sale.receiptId ?? '',
      '─────────────────────',
      lines,
      '─────────────────────',
      sale.discountPct > 0 ? `Discount: −${fmt(sale.discountAmt)}` : null,
      `Total: ${fmt(sale.total)}`,
      `Paid via: ${sale.paymentMethod}`,
      sale.customerName ? `Customer: ${sale.customerName}` : null,
      `Date: ${new Date(sale.completedAt ?? Date.now()).toLocaleString('en-GH')}`,
    ].filter(Boolean).join('\n');

    if (navigator.share) {
      navigator.share({ title: 'Receipt', text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  }

  // ── Print receipt ─────────────────────────────────────────────────────────

  function handlePrintReceipt(sale: CompletedSale) {
    printReceipt({ ...sale, receiptId: sale.receiptId });
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col overflow-hidden">

      <SessionScreen
        isOpen={sessionOpen}
        warehouses={WAREHOUSES}
        activeWarehouseId={warehouse.id}
        onSelect={handleWarehouseSelect}
      />

      <POSHeader
        warehouseName={warehouse.name}
        search={search}
        cartCount={cartCount}
        onSearchChange={setSearch}
        onWarehouseTap={() => setSessionOpen(true)}
        onCartTap={() => cartCount > 0 && setCartOpen(true)}
      />

      <div className="flex-1 overflow-y-auto">
        <ProductGrid
          products={products}
          loading={loading}
          search={search}
          category={category}
          onSelect={product => setActiveProduct(structuredClone(product))}
          onClearSearch={() => setSearch('')}
          onCategoryChange={setCategory}
        />
      </div>

      <CartBar
        lines={cart}
        onOpen={() => cartCount > 0 && setCartOpen(true)}
      />

      <SizePickerSheet
        product={activeProduct}
        onAdd={handleAddToCart}
        onClose={() => setActiveProduct(null)}
      />

      <CartSheet
        isOpen={cartOpen}
        lines={cart}
        warehouseId={warehouse.id}
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

      {/* Toast */}
      {toast && (
        <div key={toast.id} className={`
          fixed bottom-24 left-1/2 -translate-x-1/2 z-40
          px-4 py-2.5 rounded-full
          bg-slate-900 text-white text-[13px] font-semibold
          shadow-[0_4px_20px_rgba(0,0,0,0.2)]
          whitespace-nowrap pointer-events-none
          border-l-[3px]
          ${toast.type === 'warn' ? 'border-amber-400' : toast.type === 'err' ? 'border-red-500' : 'border-emerald-500'}
          animate-[posToastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
        `}>
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
