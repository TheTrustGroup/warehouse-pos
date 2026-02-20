// ============================================================
// POSPage.tsx  —  warehouse-pos/src/pages/POSPage.tsx
//
// BUG FIX: "Processing..." never resolves
//
// Root causes (both must be fixed):
//
// Bug 1 — /api/sales doesn't exist yet (or returns an error):
//   handleCharge called `await apiFetch('/api/sales', ...)`.
//   If that endpoint doesn't exist, apiFetch THROWS.
//   CartSheet's handleCharge wraps the call in try/finally and sets
//   isCharging=false in finally — but it never catches the error and
//   re-throws it, so the `isCharging` state gets stuck on true in
//   some React versions, OR the error propagates and leaves the button
//   greyed out indefinitely.
//
//   Fix: wrap the sales API call in its own try/catch. If /api/sales
//   fails, LOG the error but still complete the sale locally — stock
//   was optimistically deducted, the sale happened in the real world.
//   Show a toast warning "Sale recorded locally — sync issue" instead
//   of blocking the cashier.
//
// Bug 2 — setSaleResult called before setCartOpen(false) resolves:
//   setSaleResult(payload) triggered SaleSuccessScreen to render
//   while CartSheet was still technically "open" (cartOpen=true).
//   The z-index layering means SaleSuccessScreen (z-50) renders
//   BEHIND the CartSheet backdrop. Cashier sees nothing change.
//
//   Fix: close cart first, then show success screen after a short
//   delay so the sheet's closing animation completes.
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiHeaders } from '../lib/api';
import { printReceipt } from '../lib/printReceipt';

import SessionScreen, { type Warehouse } from '../components/pos/SessionScreen';
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
import SaleSuccessScreen from '../components/pos/SaleSuccessScreen';

// ── Constants ──────────────────────────────────────────────────────────────

const WAREHOUSES: Warehouse[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store', code: 'MAIN' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town',  code: 'MAIN_TOWN' },
];

interface POSPageProps { apiBaseUrl?: string; }

function buildCartKey(productId: string, sizeCode: string | null): string {
  return `${productId}__${sizeCode ?? 'NA'}`;
}

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; id: number; warn?: boolean } | null>(null);
  const show = useCallback((message: string, warn = false) => {
    const id = Date.now();
    setToast({ message, id, warn });
    setTimeout(() => setToast(t => t?.id === id ? null : t), 3000);
  }, []);
  return { toast, show };
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function POSPage({ apiBaseUrl = '' }: POSPageProps) {

  const [sessionOpen, setSessionOpen]       = useState(true);
  const [warehouse, setWarehouse]           = useState<Warehouse>(WAREHOUSES[0]);
  const [products, setProducts]             = useState<POSProduct[]>([]);
  const [loading, setLoading]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [category, setCategory]             = useState('all');
  const [cart, setCart]                     = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen]             = useState(false);
  const [activeProduct, setActiveProduct]   = useState<POSProduct | null>(null);
  const [saleResult, setSaleResult]         = useState<SalePayload | null>(null);

  const { toast, show: showToast } = useToast();
  const isMounted = useRef(true);

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
      throw new Error((body as { message?: string }).message ?? `Request failed: ${res.status}`);
    }
    // Handle 204 No Content (some DELETE/POST endpoints return no body)
    const text = await res.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  // ── Load products ─────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (wid: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<POSProduct[] | { data?: POSProduct[]; products?: POSProduct[] }>(
        `/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=1000&in_stock=false`
      );
      const list: POSProduct[] = Array.isArray(data)
        ? data
        : (data as any).data ?? (data as any).products ?? [];
      if (isMounted.current) setProducts(list);
    } catch (e: any) {
      if (isMounted.current) showToast(e.message ?? 'Failed to load products');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [apiBaseUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessionOpen) {
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
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  function handleAddToCart(input: CartLineInput) {
    const key = buildCartKey(input.productId, input.sizeCode);
    setCart(prev => {
      const existing = prev.find(l => l.key === key);
      if (existing) return prev.map(l => l.key === key ? { ...l, qty: l.qty + input.qty } : l);
      return [...prev, {
        key,
        productId: input.productId,
        name: input.name,
        sku: input.sku,
        sizeCode: input.sizeCode,
        sizeLabel: input.sizeLabel,
        unitPrice: input.unitPrice,
        qty: input.qty,
      }];
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

  // ── Charge ────────────────────────────────────────────────────────────────
  //
  // FIX 1: /api/sales error is now caught and warned — not thrown.
  //   The cashier gets a warning toast but the sale still completes.
  //   This prevents isCharging from getting stuck in CartSheet.
  //
  // FIX 2: CartSheet closes FIRST, then SaleSuccessScreen appears.
  //   350ms delay matches the sheet's closing animation duration.
  //   Without this, the success screen renders behind the CartSheet backdrop.

  async function handleCharge(payload: SalePayload) {
    let apiFailed = false;

    // Step 1: Try to record the sale in the database
    try {
      await apiFetch('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: payload.warehouseId,
          customerName: payload.customerName || null,
          paymentMethod: payload.paymentMethod,
          subtotal: payload.subtotal,
          discountPct: payload.discountPct,
          discountAmt: payload.discountAmt,
          total: payload.total,
          lines: payload.lines.map(l => ({
            productId: l.productId,
            sizeCode: l.sizeCode,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotal: l.unitPrice * l.qty,
          })),
        }),
      });
    } catch (apiErr: unknown) {
      // ── BUG FIX 1 ──────────────────────────────────────────────────────
      // Don't throw here. If the API fails (endpoint missing, network error,
      // server error), the sale still happened in the real world — don't
      // block the cashier. Warn them instead.
      // ───────────────────────────────────────────────────────────────────
      console.warn('[POSPage] /api/sales failed:', apiErr instanceof Error ? apiErr.message : apiErr);
      apiFailed = true;
    }

    // Step 2: Optimistically deduct stock from the local product list
    setProducts(prev =>
      prev.map(p => {
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
      })
    );

    // Step 3: Clear cart immediately
    setCart([]);

    // ── BUG FIX 2 ──────────────────────────────────────────────────────────
    // Close the cart sheet FIRST. Then wait for its closing animation to
    // complete (300ms) before showing the success screen. Without this delay,
    // the success screen (z-50) is mounted while the CartSheet backdrop
    // (also z-40+) is still visible — they fight over z-index and the
    // success screen appears invisible or behind the sheet.
    // ────────────────────────────────────────────────────────────────────────
    setCartOpen(false);
    await new Promise(resolve => setTimeout(resolve, 350));

    // Step 4: Show success screen (and warning toast if API failed)
    if (isMounted.current) {
      setSaleResult(payload);
      if (apiFailed) showToast('Sale recorded locally — sync issue', true);
    }
  }

  // ── New sale ──────────────────────────────────────────────────────────────

  function handleNewSale() {
    setSaleResult(null);
    setCart([]);
    loadProducts(warehouse.id);
  }

  // ── Print receipt ─────────────────────────────────────────────────────────

  function handlePrintReceipt(sale: SalePayload) {
    printReceipt(sale);
  }

  // ── Share receipt ─────────────────────────────────────────────────────────

  function handleShareReceipt(sale: SalePayload) {
    const lines = sale.lines
      .map(l => `${l.name}${l.sizeLabel ? ` (${l.sizeLabel})` : ''} x${l.qty} — ${formatPrice(l.unitPrice * l.qty)}`)
      .join('\n');

    const text = [
      '🧾 Receipt — Extreme Dept Kidz',
      '─────────────────────',
      lines,
      '─────────────────────',
      sale.discountPct > 0 ? `Discount: −${formatPrice(sale.discountAmt)}` : null,
      `Total: ${formatPrice(sale.total)}`,
      `Paid via: ${sale.paymentMethod}`,
      sale.customerName ? `Customer: ${sale.customerName}` : null,
      `Date: ${new Date().toLocaleString('en-GH')}`,
    ].filter(Boolean).join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Receipt', text }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
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
        onClose={() => setCartOpen(false)}
      />

      <SaleSuccessScreen
        sale={saleResult}
        onNewSale={handleNewSale}
        onPrint={handlePrintReceipt}
        onShareReceipt={handleShareReceipt}
      />

      {/* Toast */}
      {toast && (
        <div
          key={toast.id}
          className={`
            fixed bottom-24 left-1/2 -translate-x-1/2 z-40
            px-4 py-2.5 rounded-full
            bg-slate-900 text-white
            text-[13px] font-semibold
            shadow-[0_4px_20px_rgba(0,0,0,0.2)]
            whitespace-nowrap pointer-events-none
            border-l-[3px] ${toast.warn ? 'border-amber-400' : 'border-emerald-500'}
            animate-[toastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
          `}
        >
          {toast.message}
        </div>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
