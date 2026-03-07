// ============================================================
// SalesHistoryPage.tsx
// File: warehouse-pos/src/pages/SalesHistoryPage.tsx
//
// Full sales analytics dashboard:
//   - Revenue summary cards (today, this week, this month)
//   - Payment method breakdown
//   - Searchable transaction list with receipt detail
//   - Per-sale line items expandable
//   - CSV export
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Receipt } from 'lucide-react';
import { apiGet, apiPost } from '../lib/apiClient';
import { printReceipt } from '../lib/printReceipt';
import { useAuth } from '../contexts/AuthContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { isValidWarehouseId } from '../lib/warehouseId';
import { PERMISSIONS } from '../types/permissions';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

interface SalesHistoryPageProps { apiBaseUrl?: string; }

// ── Types ──────────────────────────────────────────────────────────────────

interface SaleLine {
  id: string;
  productId: string;
  sizeCode: string | null;
  name: string;
  sku: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

interface Sale {
  id: string;
  receiptId: string;
  warehouseId: string;
  customerName: string | null;
  paymentMethod: 'Cash' | 'MoMo' | 'Card';
  subtotal: number;
  discountPct: number;
  discountAmt: number;
  total: number;
  itemCount: number;
  soldBy: string | null;
  createdAt: string;
  voidedAt?: string | null;
  lines: SaleLine[];
}

type DateFilter = 'today' | 'week' | 'month' | 'all';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `GH₵${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GH', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function startOf(filter: DateFilter): string | null {
  const now = new Date();
  if (filter === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (filter === 'week') {
    const day = now.getDay();
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (filter === 'month') {
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  return null;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconReceipt = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const IconSearch = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

const IconPrint = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
);

const IconChevron = ({ down }: { down?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
    style={{ transform: down ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);

const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

// ── Payment badge ──────────────────────────────────────────────────────────

/** Normalize API payment_method (cash, card, mobile_money, mixed) to display label. */
function paymentMethodDisplay(method: string): string {
  const m = (method ?? '').trim().toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'card') return 'Card';
  if (m === 'mobile_money' || m === 'momo') return 'MoMo';
  if (m === 'mixed') return 'Mixed';
  return method || '—';
}

const PAY_COLORS: Record<string, string> = {
  Cash: 'bg-emerald-100 text-emerald-800',
  MoMo: 'bg-amber-100  text-amber-800',
  Card: 'bg-blue-100   text-blue-800',
  Mixed: 'bg-violet-100 text-violet-800',
};

function PayBadge({ method }: { method: string }) {
  const label = paymentMethodDisplay(method);
  const emoji = label === 'Cash' ? '💵' : label === 'MoMo' ? '📱' : label === 'Card' ? '💳' : '💼';
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold ${PAY_COLORS[label] ?? 'bg-slate-100 text-slate-600'}`}>
      {emoji} {label}
    </span>
  );
}

// ── Summary card ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] px-4 py-4 flex flex-col gap-1">
      <p className="text-[11px] font-bold text-[var(--edk-ink-3)] uppercase tracking-wider">{label}</p>
      <p className={`text-[20px] font-extrabold tabular-nums leading-tight ${accent ?? 'text-[var(--edk-ink)]'}`}>
        {value}
      </p>
      {sub != null && <p className="text-[11px] text-[var(--edk-ink-3)]">{sub}</p>}
    </div>
  );
}

// ── Sale row ───────────────────────────────────────────────────────────────

function SaleRow({
  sale,
  onPrint,
  onVoid,
  canVoid,
  voiding,
}: {
  sale: Sale;
  onPrint: (s: Sale) => void;
  onVoid?: (s: Sale) => void;
  canVoid: boolean;
  voiding: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isVoided = Boolean(sale.voidedAt);

  return (
    <div className="rounded-[var(--edk-radius)] overflow-hidden border border-[var(--edk-border)] bg-[var(--edk-surface)]">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[var(--edk-bg)] transition-colors text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--edk-surface-2)] flex items-center justify-center text-[var(--edk-ink-3)] flex-shrink-0">
            <IconReceipt />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-[var(--edk-ink)]">{sale.receiptId}</span>
              <PayBadge method={sale.paymentMethod} />
              {isVoided && <Badge variant="gray" size="sm">Voided</Badge>}
            </div>
            <p className="text-[11px] text-[var(--edk-ink-3)] mt-0.5">
              {fmtDate(sale.createdAt)}
              {sale.customerName != null && sale.customerName !== '' && <> · {sale.customerName}</>}
            </p>
            <p className="text-[11px] text-[var(--edk-ink-3)]">
              {sale.itemCount} item{sale.itemCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-[15px] font-extrabold text-[var(--edk-ink)] tabular-nums">{fmt(sale.total)}</span>
          <span className="text-[var(--edk-ink-3)]">
            <IconChevron down={expanded} />
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[var(--edk-border)] bg-[var(--edk-surface-2)]">
          <div className="px-4 py-3 space-y-2">
            {sale.lines.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[var(--edk-ink)] truncate">
                    {l.name}
                    {l.sizeCode != null && l.sizeCode !== '' && <span className="text-[var(--edk-ink-3)] font-normal"> · {l.sizeCode}</span>}
                  </p>
                  <p className="text-[11px] text-[var(--edk-ink-3)]">{l.qty} × {fmt(l.unitPrice)}</p>
                </div>
                <span className="text-[13px] font-bold text-[var(--edk-ink)] tabular-nums flex-shrink-0">
                  {fmt(l.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-[var(--edk-border-mid)] space-y-1">
            {sale.discountPct > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--edk-ink-2)]">Subtotal</span>
                <span className="text-[var(--edk-ink-2)] tabular-nums">{fmt(sale.subtotal)}</span>
              </div>
            )}
            {sale.discountPct > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-[var(--edk-green)]">Discount ({sale.discountPct}%)</span>
                <span className="text-[var(--edk-green)] tabular-nums">−{fmt(sale.discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px] font-bold pt-1">
              <span className="text-[var(--edk-ink)]">Total</span>
              <span className="text-[var(--edk-ink)] tabular-nums">{fmt(sale.total)}</span>
            </div>
          </div>

          <div className="px-4 pb-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onPrint(sale)} leftIcon={<IconPrint />}>
              Print receipt
            </Button>
            {canVoid && !isVoided && onVoid != null && (
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => onVoid(sale)}
                disabled={voiding}
                loading={voiding}
              >
                Void sale
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Fallback when WarehouseContext has not yet loaded warehouses (display only; API is not called until a valid warehouse is selected). */
const FALLBACK_WAREHOUSES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town' },
];

export default function SalesHistoryPage({ apiBaseUrl = '' }: SalesHistoryPageProps) {
  const { hasPermission, hasRole } = useAuth();
  const { warehouses: contextWarehouses, currentWarehouseId } = useWarehouse();
  const canVoid = hasPermission(PERMISSIONS.POS.VOID_TRANSACTION);
  const canClearHistory = hasRole(['admin', 'super_admin']);

  const warehouses = contextWarehouses.length > 0 ? contextWarehouses : FALLBACK_WAREHOUSES;
  const [sales, setSales]           = useState<Sale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState(currentWarehouseId || warehouses[0].id);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [search, setSearch]         = useState('');
  const [whDropdown, setWhDropdown] = useState(false);
  const [voidingId, setVoidingId]    = useState<string | null>(null);
  const [clearHistoryLoading, setClearHistoryLoading] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchSales = useCallback(async () => {
    if (!isValidWarehouseId(warehouseId)) {
      setLoading(false);
      setError(null);
      setSales([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const from = startOf(dateFilter);
      const params = new URLSearchParams({ warehouse_id: warehouseId, limit: '500' });
      if (from) params.set('from', from);

      const data = await apiGet<{ data?: Sale[] } | Sale[]>(
        apiBaseUrl,
        `/api/sales?${params}`,
        { maxRetries: 3, timeoutMs: 20_000 }
      );
      const list = Array.isArray(data) ? data : (data as { data?: Sale[] }).data ?? [];
      setSales(list.filter((s): s is Sale => s != null && typeof s === 'object'));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [warehouseId, dateFilter, apiBaseUrl]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // Keep warehouse filter in sync with global warehouse selection when it changes
  useEffect(() => {
    if (currentWarehouseId && warehouses.some(w => w.id === currentWarehouseId)) {
      setWarehouseId(currentWarehouseId);
    }
  }, [currentWarehouseId, warehouses]);

  // ── Filter by search ──────────────────────────────────────────────────────

  const displayed = sales.filter(s => {
    if (s == null || typeof s !== 'object') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const lines = Array.isArray(s.lines) ? s.lines : [];
    return (
      s.receiptId?.toLowerCase().includes(q) ||
      s.customerName?.toLowerCase().includes(q) ||
      lines.some((l: SaleLine) => l != null && typeof l === 'object' && (l.name?.toLowerCase().includes(q) || l.sku?.toLowerCase().includes(q)))
    );
  });

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalRevenue    = displayed.reduce((s, x) => s + x.total, 0);
  const totalItems      = displayed.reduce((s, x) => s + x.itemCount, 0);
  const pm = (s: Sale) => (s.paymentMethod ?? '').trim().toLowerCase();
  const cashTotal       = displayed.filter(s => pm(s) === 'cash').reduce((s, x) => s + x.total, 0);
  const momoTotal       = displayed.filter(s => pm(s) === 'mobile_money' || pm(s) === 'momo').reduce((s, x) => s + x.total, 0);
  const cardTotal       = displayed.filter(s => pm(s) === 'card').reduce((s, x) => s + x.total, 0);
  const avgSale         = displayed.length > 0 ? totalRevenue / displayed.length : 0;
  const currentWh       = warehouses.find(w => w.id === warehouseId) ?? warehouses[0];

  // ── Print ─────────────────────────────────────────────────────────────────

  async function handleVoid(sale: Sale) {
    if (!apiBaseUrl || !canVoid) return;
    setVoidingId(sale.id);
    setError(null);
    try {
      const base = apiBaseUrl.replace(/\/$/, '');
      await apiPost<unknown>(base, '/api/sales/void', { saleId: sale.id, warehouseId: sale.warehouseId });
      setSales(prev =>
        prev.map(s => (s.id === sale.id ? { ...s, voidedAt: new Date().toISOString() } : s))
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Void failed`;
      setError(msg);
    } finally {
      setVoidingId(null);
    }
  }

  function handlePrint(sale: Sale) {
    printReceipt({
      warehouseId: sale.warehouseId,
      customerName: sale.customerName ?? '',
      paymentMethod: sale.paymentMethod,
      subtotal: sale.subtotal,
      discountPct: sale.discountPct,
      discountAmt: sale.discountAmt,
      total: sale.total,
      lines: sale.lines.map(l => ({
        key: l.id,
        productId: l.productId,
        name: l.name,
        sku: l.sku,
        sizeCode: l.sizeCode,
        sizeLabel: l.sizeCode,
        unitPrice: l.unitPrice,
        qty: l.qty,
      })),
      receiptId: sale.receiptId,
    });
  }

  // ── Clear sales & delivery history (admin) ──────────────────────────────────

  async function handleClearHistory() {
    if (!apiBaseUrl || !canClearHistory) return;
    if (!window.confirm('Permanently delete ALL sales and delivery history? This cannot be undone.')) return;
    setClearHistoryLoading(true);
    setError(null);
    try {
      const base = apiBaseUrl.replace(/\/$/, '');
      await apiPost<unknown>(base, '/api/admin/clear-sales-history', { confirm: 'CLEAR_ALL_SALES' });
      setSales([]);
      fetchSales();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setClearHistoryLoading(false);
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────

  function handleExport() {
    const rows = [
      ['Receipt ID', 'Date', 'Customer', 'Payment', 'Items', 'Subtotal', 'Discount', 'Total', 'Sold By', 'Products'],
      ...displayed.map(s => [
        s.receiptId,
        fmtDate(s.createdAt),
        s.customerName ?? '',
        s.paymentMethod,
        s.itemCount,
        s.subtotal.toFixed(2),
        s.discountAmt.toFixed(2),
        s.total.toFixed(2),
        s.soldBy ?? '',
        s.lines.map(l => `${l.name}${l.sizeCode ? ` (${l.sizeCode})` : ''} x${l.qty}`).join('; '),
      ]),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sales-${dateFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const DATE_TABS: { key: DateFilter; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week',  label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'all',   label: 'All time' },
  ];

  return (
    <div className="min-h-screen bg-[var(--edk-bg)] pb-12">

      <header className="sticky top-0 z-20 bg-[var(--edk-surface)] border-b border-[var(--edk-border)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-[20px] font-bold text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              Sales History
            </h1>
            <div className="relative mt-0.5">
              <button type="button" onClick={() => setWhDropdown(v => !v)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-[var(--edk-ink-2)] hover:text-[var(--edk-ink)] transition-colors">
                {currentWh.name}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {whDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWhDropdown(false)} aria-hidden />
                  <div className="absolute left-0 top-6 z-20 bg-[var(--edk-surface)] rounded-xl shadow-xl border border-[var(--edk-border)] py-1.5 w-40">
                    {warehouses.map(w => (
                      <button key={w.id} type="button"
                              onClick={() => { setWarehouseId(w.id); setWhDropdown(false); }}
                              className={`w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors
                                ${warehouseId === w.id ? 'text-[var(--edk-red)] bg-[var(--edk-red-soft)]' : 'text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)]'}`}>
                        {warehouseId === w.id && '✓ '}{w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canClearHistory && (
              <Button type="button" variant="danger" size="sm" onClick={handleClearHistory} disabled={clearHistoryLoading} loading={clearHistoryLoading}>
                Clear history
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={fetchSales} className="min-w-[36px] h-9 px-0" aria-label="Refresh">
              <IconRefresh />
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleExport} disabled={displayed.length === 0} leftIcon={<IconDownload />}>
              Export
            </Button>
          </div>
        </div>

        <div className="flex gap-1 px-4 pb-3">
          {DATE_TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setDateFilter(t.key)}
                    className={`flex-1 h-8 rounded-xl text-[12px] font-bold transition-all duration-150
                      ${dateFilter === t.key
                        ? 'bg-[var(--edk-red)] text-white shadow-[0_2px_8px_var(--edk-red-soft)]'
                        : 'bg-[var(--edk-surface-2)] text-[var(--edk-ink-3)] hover:bg-[var(--edk-border-mid)]'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Revenue" value={fmt(totalRevenue)} sub={`${displayed.length} transactions`} accent="text-[var(--edk-red)]" />
          <SummaryCard label="Items sold" value={totalItems.toLocaleString()} sub={`Avg ${fmt(avgSale)}/sale`} />
          <SummaryCard label="Cash" value={fmt(cashTotal)} />
          <SummaryCard label="MoMo" value={fmt(momoTotal)} />
        </div>

        {cardTotal > 0 && (
          <SummaryCard label="Card" value={fmt(cardTotal)} />
        )}

        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--edk-ink-3)] pointer-events-none">
            <IconSearch />
          </span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search receipt, customer, product…"
                 className="w-full h-11 pl-10 pr-4 rounded-xl border-[1.5px] border-[var(--edk-border-mid)] bg-[var(--edk-surface)]
                            text-[14px] text-[var(--edk-ink)] placeholder:text-[var(--edk-ink-3)]
                            focus:outline-none focus:border-[var(--edk-red)] focus:ring-[3px] focus:ring-[var(--edk-red-soft)]
                            transition-all duration-150"
          />
        </div>

        <p className="text-[12px] font-medium text-[var(--edk-ink-3)]">
          {loading ? 'Loading…' : `${displayed.length} transaction${displayed.length !== 1 ? 's' : ''}`}
        </p>

        {error != null && error !== '' && (
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-red-border)] bg-[var(--edk-red-soft)] px-4 py-4 text-center">
            <p className="text-[14px] font-semibold text-[var(--edk-ink)]">{error}</p>
            <Button type="button" variant="primary" size="sm" onClick={fetchSales} className="mt-2">
              Retry
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center gap-4">
            <LoadingSpinner size="md" />
            <p className="text-[13px] font-medium text-[var(--edk-ink-3)]">Loading sales…</p>
            <div className="w-full space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-20 bg-[var(--edk-surface)] rounded-[var(--edk-radius)] border border-[var(--edk-border)] animate-pulse" />
              ))}
            </div>
          </div>
        )}

        {!loading && !error && displayed.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={dateFilter === 'today' ? 'No sales today' : 'No sales found'}
            description="Complete a checkout to see sales here."
          />
        )}

        {/* ── Sale rows ── */}
        {!loading && displayed.length > 0 && (
          <div className="space-y-3">
            {displayed.map(sale => (
              <SaleRow
                key={sale.id}
                sale={sale}
                onPrint={handlePrint}
                onVoid={handleVoid}
                canVoid={canVoid}
                voiding={voidingId === sale.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
