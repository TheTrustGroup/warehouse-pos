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
import { apiGet } from '../lib/apiClient';
import { printReceipt } from '../lib/printReceipt';
import { getApiHeaders } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSIONS } from '../types/permissions';

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

const PAY_COLORS: Record<string, string> = {
  Cash: 'bg-emerald-100 text-emerald-800',
  MoMo: 'bg-amber-100  text-amber-800',
  Card: 'bg-blue-100   text-blue-800',
};

function PayBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold ${PAY_COLORS[method] ?? 'bg-slate-100 text-slate-600'}`}>
      {method === 'Cash' ? '💵' : method === 'MoMo' ? '📱' : '💳'} {method}
    </span>
  );
}

// ── Summary card ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] flex flex-col gap-1">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[20px] font-extrabold tabular-nums leading-tight ${accent ?? 'text-slate-900'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
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
    <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.06)] border border-slate-100">
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
            <IconReceipt />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-bold text-slate-900">{sale.receiptId}</span>
              <PayBadge method={sale.paymentMethod} />
              {isVoided && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                  Voided
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {fmtDate(sale.createdAt)}
              {sale.customerName && <> · {sale.customerName}</>}
            </p>
            <p className="text-[11px] text-slate-400">
              {sale.itemCount} item{sale.itemCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          <span className="text-[15px] font-extrabold text-slate-900 tabular-nums">{fmt(sale.total)}</span>
          <span className="text-slate-400">
            <IconChevron down={expanded} />
          </span>
        </div>
      </button>

      {/* Expanded lines */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50">
          {/* Line items */}
          <div className="px-4 py-3 space-y-2">
            {sale.lines.map(l => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate">
                    {l.name}
                    {l.sizeCode && <span className="text-slate-400 font-normal"> · {l.sizeCode}</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{l.qty} × {fmt(l.unitPrice)}</p>
                </div>
                <span className="text-[13px] font-bold text-slate-700 tabular-nums flex-shrink-0">
                  {fmt(l.lineTotal)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="px-4 py-3 border-t border-slate-200 space-y-1">
            {sale.discountPct > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-slate-600 tabular-nums">{fmt(sale.subtotal)}</span>
              </div>
            )}
            {sale.discountPct > 0 && (
              <div className="flex justify-between text-[12px]">
                <span className="text-emerald-600">Discount ({sale.discountPct}%)</span>
                <span className="text-emerald-600 tabular-nums">−{fmt(sale.discountAmt)}</span>
              </div>
            )}
            <div className="flex justify-between text-[13px] font-bold pt-1">
              <span className="text-slate-900">Total</span>
              <span className="text-slate-900 tabular-nums">{fmt(sale.total)}</span>
            </div>
          </div>

          {/* Print / Void */}
          <div className="px-4 pb-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onPrint(sale)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-200 hover:bg-slate-300
                         text-[12px] font-semibold text-slate-700 transition-colors"
            >
              <IconPrint /> Print receipt
            </button>
            {canVoid && !isVoided && onVoid && (
              <button
                type="button"
                onClick={() => onVoid(sale)}
                disabled={voiding}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-100 hover:bg-red-200
                           text-[12px] font-semibold text-red-700 transition-colors disabled:opacity-50"
              >
                {voiding ? 'Voiding…' : 'Void sale'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const WAREHOUSES = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Main Store' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Main Town'  },
];

export default function SalesHistoryPage({ apiBaseUrl = '' }: SalesHistoryPageProps) {

  const { hasPermission } = useAuth();
  const canVoid = hasPermission(PERMISSIONS.POS.VOID_TRANSACTION);

  const [sales, setSales]           = useState<Sale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState(WAREHOUSES[0].id);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [search, setSearch]         = useState('');
  const [whDropdown, setWhDropdown] = useState(false);
  const [voidingId, setVoidingId]    = useState<string | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchSales = useCallback(async () => {
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
      setSales(Array.isArray(data) ? data : (data as { data?: Sale[] }).data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [warehouseId, dateFilter, apiBaseUrl]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // ── Filter by search ──────────────────────────────────────────────────────

  const displayed = sales.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.receiptId?.toLowerCase().includes(q) ||
      s.customerName?.toLowerCase().includes(q) ||
      s.lines.some(l => l.name.toLowerCase().includes(q) || l.sku?.toLowerCase().includes(q))
    );
  });

  // ── Derived stats ─────────────────────────────────────────────────────────

  const totalRevenue    = displayed.reduce((s, x) => s + x.total, 0);
  const totalItems      = displayed.reduce((s, x) => s + x.itemCount, 0);
  const cashTotal       = displayed.filter(s => s.paymentMethod === 'Cash').reduce((s, x) => s + x.total, 0);
  const momoTotal       = displayed.filter(s => s.paymentMethod === 'MoMo').reduce((s, x) => s + x.total, 0);
  const cardTotal       = displayed.filter(s => s.paymentMethod === 'Card').reduce((s, x) => s + x.total, 0);
  const avgSale         = displayed.length > 0 ? totalRevenue / displayed.length : 0;
  const currentWh       = WAREHOUSES.find(w => w.id === warehouseId) ?? WAREHOUSES[0];

  // ── Print ─────────────────────────────────────────────────────────────────

  async function handleVoid(sale: Sale) {
    if (!apiBaseUrl || !canVoid) return;
    setVoidingId(sale.id);
    try {
      const base = apiBaseUrl.replace(/\/$/, '');
      const res = await fetch(`${base}/api/sales/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getApiHeaders() as Record<string, string> },
        credentials: 'include',
        body: JSON.stringify({ saleId: sale.id, warehouseId: sale.warehouseId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Void failed (${res.status})`);
        return;
      }
      setSales(prev =>
        prev.map(s => (s.id === sale.id ? { ...s, voidedAt: new Date().toISOString() } : s))
      );
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
    <div className="min-h-screen bg-slate-100 pb-12">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-100 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <h1 className="text-[20px] font-bold text-slate-900">Sales History</h1>
            {/* Warehouse selector */}
            <div className="relative mt-0.5">
              <button type="button" onClick={() => setWhDropdown(v => !v)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
                {currentWh.name}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {whDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setWhDropdown(false)}/>
                  <div className="absolute left-0 top-6 z-20 bg-white rounded-xl shadow-xl border border-slate-100 py-1.5 w-40">
                    {WAREHOUSES.map(w => (
                      <button key={w.id} type="button"
                              onClick={() => { setWarehouseId(w.id); setWhDropdown(false); }}
                              className={`w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors
                                ${warehouseId === w.id ? 'text-red-500 bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}>
                        {warehouseId === w.id && '✓ '}{w.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={fetchSales}
                    className="w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-500 flex items-center justify-center hover:bg-slate-50 transition-colors">
              <IconRefresh/>
            </button>
            <button type="button" onClick={handleExport} disabled={displayed.length === 0}
                    className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[13px] font-semibold flex items-center gap-1.5 hover:bg-slate-700 disabled:opacity-40 transition-colors">
              <IconDownload/> Export
            </button>
          </div>
        </div>

        {/* Date filter tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {DATE_TABS.map(t => (
            <button key={t.key} type="button" onClick={() => setDateFilter(t.key)}
                    className={`flex-1 h-8 rounded-xl text-[12px] font-bold transition-all duration-150
                      ${dateFilter === t.key
                        ? 'bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.3)]'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 py-4 space-y-4">

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 gap-3">
          <SummaryCard label="Revenue" value={fmt(totalRevenue)} sub={`${displayed.length} transactions`} accent="text-red-500" />
          <SummaryCard label="Items sold" value={totalItems.toLocaleString()} sub={`Avg ${fmt(avgSale)}/sale`} />
          <SummaryCard label="Cash" value={fmt(cashTotal)} />
          <SummaryCard label="MoMo" value={fmt(momoTotal)} />
        </div>

        {cardTotal > 0 && (
          <SummaryCard label="Card" value={fmt(cardTotal)} />
        )}

        {/* ── Search ── */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            <IconSearch/>
          </span>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search receipt, customer, product…"
                 className="w-full h-11 pl-10 pr-4 rounded-xl border-[1.5px] border-slate-200 bg-white
                            text-[14px] text-slate-900 placeholder:text-slate-300
                            focus:outline-none focus:border-red-400 focus:ring-[3px] focus:ring-red-100
                            transition-all duration-150"/>
        </div>

        {/* ── Results count ── */}
        <p className="text-[12px] font-medium text-slate-400">
          {loading ? 'Loading…' : `${displayed.length} transaction${displayed.length !== 1 ? 's' : ''}`}
        </p>

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 text-center">
            <p className="text-[14px] font-semibold text-red-700">{error}</p>
            <button type="button" onClick={fetchSales} className="mt-2 text-[13px] font-bold text-red-500 hover:text-red-700">
              Retry
            </button>
          </div>
        )}

        {/* ── Loading skeletons ── */}
        {loading && (
          <div className="space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse"/>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && !error && displayed.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300">
              <IconReceipt/>
            </div>
            <p className="text-[15px] font-bold text-slate-700">No sales {dateFilter === 'today' ? 'today' : 'found'}</p>
            <p className="text-[13px] text-slate-400">Complete a checkout to see sales here.</p>
          </div>
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
