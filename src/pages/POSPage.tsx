// ============================================================
// POSPage.tsx
// File: warehouse-pos/src/pages/POSPage.tsx
//
// Final assembly of all POS components.
// Owns all state:
// - session (warehouse selection)
// - products (from API, refreshed after each sale)
// - cart (line items)
// - active product (size picker)
// - search + category filter
// - sale result (success screen)
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { getApiHeaders } from '../lib/api';

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
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Main Store',
    code: 'MAIN',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Main Town',
    code: 'MAIN_TOWN',
  },
];

// ── Types ──────────────────────────────────────────────────────────────────

interface POSPageProps {
  apiBaseUrl?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildCartKey(productId: string, sizeCode: string | null): string {
  return `${productId}__${sizeCode ?? 'NA'}`;
}

function formatPrice(n: number): string {
  return `GH₵${Number(n).toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Toast hook ─────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const show = useCallback((message: string) => {
    const id = Date.now();
    setToast({ message, id });
    setTimeout(() => setToast(t => t?.id === id ? null : t), 2500);
  }, []);
  return { toast, show };
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function POSPage({ apiBaseUrl = '' }: POSPageProps) {

  // ── Session ───────────────────────────────────────────────────────────────
  const [sessionOpen, setSessionOpen]   = useState(true);
  const [warehouse, setWarehouse]       = useState<Warehouse>(WAREHOUSES[0]);

  // ── Products ──────────────────────────────────────────────────────────────
  const [products, setProducts]         = useState<POSProduct[]>([]);
  const [loading, setLoading]           = useState(false);

  // ── Filter ────────────────────────────────────────────────────────────────
  const [search, setSearch]             = useState('');
  const [category, setCategory]         = useState<string>('all');

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart]                 = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen]         = useState(false);

  // ── Size picker ───────────────────────────────────────────────────────────
  const [activeProduct, setActiveProduct] = useState<POSProduct | null>(null);

  // ── Sale result ───────────────────────────────────────────────────────────
  const [saleResult, setSaleResult]     = useState<SalePayload | null>(null);

  const { toast, show: showToast }      = useToast();
  const isMounted                       = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // ── API ───────────────────────────────────────────────────────────────────

  async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const base = apiBaseUrl.replace(/\/$/, '');
    const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
    const res = await fetch(url, {
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
      throw new Error(body.message ?? `Request failed: ${res.status}`);
    }
    return res.json();
  }

  // ── Load products ─────────────────────────────────────────────────────────

  const loadProducts = useCallback(async (wid: string) => {
    setLoading(true);
    try {
      const data = await apiFetch<
        POSProduct[] | { data?: POSProduct[]; products?: POSProduct[] }
      >(
        `/api/products?warehouse_id=${encodeURIComponent(wid)}&limit=1000&in_stock=false`
      );
      const list: POSProduct[] = Array.isArray(data)
        ? data
        : (data as { data?: POSProduct[]; products?: POSProduct[] }).data ?? (data as { data?: POSProduct[]; products?: POSProduct[] }).products ?? [];

      if (isMounted.current) setProducts(list);
    } catch (e: unknown) {
      if (isMounted.current) showToast(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [apiBaseUrl, showToast]);

  // Reload when warehouse changes
  useEffect(() => {
    if (!sessionOpen) {
      loadProducts(warehouse.id);
      setCart([]);
      setSearch('');
      setCategory('all');
    }
  }, [warehouse.id, sessionOpen, loadProducts]);

  // ── Session handlers ──────────────────────────────────────────────────────

  function handleWarehouseSelect(w: Warehouse) {
    setWarehouse(w);
    setSessionOpen(false);
  }

  // ── Cart handlers ─────────────────────────────────────────────────────────

  function handleAddToCart(input: CartLineInput) {
    const key = buildCartKey(input.productId, input.sizeCode);
    setCart(prev => {
      const existing = prev.find(l => l.key === key);
      if (existing) {
        return prev.map(l =>
          l.key === key ? { ...l, qty: l.qty + input.qty } : l
        );
      }
      return [
        ...prev,
        {
          key,
          productId: input.productId,
          name: input.name,
          sku: input.sku,
          sizeCode: input.sizeCode,
          sizeLabel: input.sizeLabel,
          unitPrice: input.unitPrice,
          qty: input.qty,
        },
      ];
    });

    const sizeStr = input.sizeLabel ? ` · ${input.sizeLabel}` : '';
    showToast(`${input.name}${sizeStr} added`);
  }

  function handleUpdateQty(key: string, delta: number) {
    setCart(prev =>
      prev.map(l =>
        l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l
      )
    );
  }

  function handleRemoveLine(key: string) {
    setCart(prev => prev.filter(l => l.key !== key));
  }

  function handleClearCart() {
    setCart([]);
    setCartOpen(false);
  }

  // ── Charge / complete sale ────────────────────────────────────────────────

  async function handleCharge(payload: SalePayload) {
    // 1. Record sale in DB
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

    // 2. Deduct stock optimistically from local products list
    setProducts(prev =>
      prev.map(p => {
        const saleLines = payload.lines.filter(l => l.productId === p.id);
        if (saleLines.length === 0) return p;

        if (p.sizeKind === 'sized') {
          const updatedSizes = p.quantityBySize.map(row => {
            const line = saleLines.find(l => l.sizeCode === row.sizeCode);
            return line
              ? { ...row, quantity: Math.max(0, row.quantity - line.qty) }
              : row;
          });
          const newTotal = updatedSizes.reduce((s, r) => s + r.quantity, 0);
          return { ...p, quantityBySize: updatedSizes, quantity: newTotal };
        }

        const totalSold = saleLines.reduce((s, l) => s + l.qty, 0);
        return { ...p, quantity: Math.max(0, p.quantity - totalSold) };
      })
    );

    // 3. Clear cart + close cart sheet
    setCart([]);
    setCartOpen(false);

    // 4. Show success screen
    setSaleResult(payload);
  }

  // ── New sale ──────────────────────────────────────────────────────────────

  function handleNewSale() {
    setSaleResult(null);
    setCart([]);
    // Refresh products to get accurate stock from server
    loadProducts(warehouse.id);
  }

  // ── Share receipt ─────────────────────────────────────────────────────────

  function handleShareReceipt(sale: SalePayload) {
    const lines = sale.lines
      .map(l => `${l.name}${l.sizeLabel ? ' (' + l.sizeLabel + ')' : ''} x${l.qty} — ${formatPrice(l.unitPrice * l.qty)}`)
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
    ]
      .filter(Boolean)
      .join('\n');

    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator.share({ title: 'Receipt', text }).catch(() => {
        // User dismissed share sheet — no-op
      });
    } else {
      // Fallback: open WhatsApp
      window.open(
        `https://wa.me/?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col overflow-hidden">

      {/* ── Session screen ── */}
      <SessionScreen
        isOpen={sessionOpen}
        warehouses={WAREHOUSES}
        activeWarehouseId={warehouse.id}
        onSelect={handleWarehouseSelect}
      />

      {/* ── POS Header ── */}
      <POSHeader
        warehouseName={warehouse.name}
        search={search}
        cartCount={cartCount}
        onSearchChange={setSearch}
        onWarehouseTap={() => setSessionOpen(true)}
        onCartTap={() => cartCount > 0 && setCartOpen(true)}
      />

      {/* ── Product grid ── */}
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

      {/* ── Cart bar ── */}
      <CartBar
        lines={cart}
        onOpen={() => cartCount > 0 && setCartOpen(true)}
      />

      {/* ── Size picker sheet ── */}
      <SizePickerSheet
        product={activeProduct}
        onAdd={handleAddToCart}
        onClose={() => setActiveProduct(null)}
      />

      {/* ── Cart sheet ── */}
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

      {/* ── Sale success screen ── */}
      <SaleSuccessScreen
        sale={saleResult}
        onNewSale={handleNewSale}
        onShareReceipt={handleShareReceipt}
      />

      {/* ── Toast ── */}
      {toast && (
        <div
          key={toast.id}
          className="
            fixed bottom-24 left-1/2 -translate-x-1/2 z-40
            px-4 py-2.5 rounded-full
            bg-slate-900 text-white
            text-[13px] font-semibold
            shadow-[0_4px_20px_rgba(0,0,0,0.2)]
            border-l-[3px] border-emerald-500
            whitespace-nowrap
            pointer-events-none
            animate-[toastIn_0.3s_cubic-bezier(0.34,1.56,0.64,1)]
          "
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
