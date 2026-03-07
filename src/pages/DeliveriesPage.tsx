// ============================================================
// DeliveriesPage.tsx
// File: warehouse-pos/src/pages/DeliveriesPage.tsx
//
// Pending deliveries dashboard.
//   - Counts: pending, dispatched, delivered today
//   - List of pending + dispatched deliveries
//   - Mark Dispatched / Mark Delivered actions
//   - Filter: All / Pending / Dispatched / Overdue
//   - Tap to expand: line items, address, phone, notes
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { Truck } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { apiGet, apiPatch } from '../lib/apiClient';
import { useWarehouse } from '../contexts/WarehouseContext';
import { isValidWarehouseId } from '../lib/warehouseId';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

// ── Types ──────────────────────────────────────────────────────────────────

interface SaleLine {
  id: string; name: string; sizeCode: string | null;
  unitPrice: number; qty: number; lineTotal: number; imageUrl: string | null;
}

interface Delivery {
  id:             string;
  receiptId:      string;
  warehouseId:    string;
  customerName:   string | null;
  recipientName:  string | null;
  recipientPhone: string | null;
  deliveryAddress:string | null;
  deliveryNotes:  string | null;
  expectedDate:   string | null;
  deliveredAt:    string | null;
  deliveryStatus: 'pending' | 'dispatched' | 'delivered' | 'cancelled';
  paymentMethod:  string;
  total:          number;
  createdAt:      string;
  lines:          SaleLine[];
}

type Filter = 'all' | 'pending' | 'dispatched' | 'overdue' | 'cancelled';

interface DeliveriesPageProps {
  warehouseId?: string;
  apiBaseUrl?:  string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `GH\u20B5${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('en-GH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(d: Delivery) {
  if (d.deliveryStatus === 'delivered') return false;
  if (!d.expectedDate) return false;
  return new Date(d.expectedDate) < new Date(new Date().toDateString());
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconTruck      = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>);
const IconCheck      = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>);
const IconPhone      = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.08 3.38 2 2 0 0 1 3.06 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16l.92.92z"/></svg>);
const IconMapPin     = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
const IconCalendar   = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>);
const IconChevron    = ({ down }: { down: boolean }) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: down ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9"/></svg>);
const IconRefresh    = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>);
const IconSpinner    = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'del-spin .8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>);
const IconClock      = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>);

function StatusBadge({ status, overdue }: { status: Delivery['deliveryStatus']; overdue?: boolean }) {
  if (overdue && status !== 'delivered' && status !== 'cancelled') {
    return <Badge variant="danger" size="sm">⚠ Overdue</Badge>;
  }
  const variantMap: Record<Delivery['deliveryStatus'], 'warning' | 'blue' | 'success' | 'gray'> = {
    pending: 'warning',
    dispatched: 'blue',
    delivered: 'success',
    cancelled: 'gray',
  };
  return <Badge variant={variantMap[status]} size="sm">{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

// ── Delivery Card ─────────────────────────────────────────────────────────

function DeliveryCard({
  delivery, onMarkDispatched, onMarkDelivered, onMarkCancelled, actionLoading,
}: {
  delivery: Delivery;
  onMarkDispatched: (id: string) => void;
  onMarkDelivered:  (id: string) => void;
  onMarkCancelled:  (id: string) => void;
  actionLoading:    string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const overdue = isOverdue(delivery);
  const loading = actionLoading === delivery.id;
  const displayName = delivery.recipientName ?? delivery.customerName ?? 'Unknown';
  const isCancelled = delivery.deliveryStatus === 'cancelled';

  const cardBorder = isCancelled
    ? 'border-[var(--edk-border)] opacity-90'
    : overdue
      ? 'border-[var(--edk-red-border)] shadow-[0_0_0_3px_var(--edk-red-soft)]'
      : 'border-[var(--edk-border)]';
  const iconBg = isCancelled
    ? 'bg-[var(--edk-surface-2)] text-[var(--edk-ink-3)]'
    : delivery.deliveryStatus === 'dispatched'
      ? 'bg-blue-50 text-blue-600'
      : overdue
        ? 'bg-[var(--edk-red-soft)] text-[var(--edk-red)]'
        : 'bg-[var(--edk-amber-bg)] text-[var(--edk-amber)]';

  return (
    <div className={`bg-[var(--edk-surface)] rounded-[var(--edk-radius)] border-[1.5px] overflow-hidden transition-all duration-200 ${cardBorder}`}>

      <button type="button" onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-[var(--edk-bg)] transition-colors">

        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
          <IconTruck />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-bold text-[var(--edk-ink)] truncate">{displayName}</p>
            <StatusBadge status={delivery.deliveryStatus} overdue={overdue} />
          </div>
          <p className="text-[12px] text-[var(--edk-ink-3)] mt-0.5 font-medium">{delivery.receiptId}</p>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            <span className="text-[12px] font-bold text-[var(--edk-ink-2)]">{fmt(delivery.total)}</span>
            {delivery.recipientPhone && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--edk-ink-3)]">
                <IconPhone />{delivery.recipientPhone}
              </span>
            )}
            {delivery.expectedDate && (
              <span className={`flex items-center gap-1 text-[11px] font-medium ${overdue ? 'text-[var(--edk-red)]' : 'text-[var(--edk-ink-3)]'}`}>
                <IconCalendar />{fmtDate(delivery.expectedDate)}
                {overdue && ' · Overdue'}
              </span>
            )}
          </div>
        </div>

        <span className="text-[var(--edk-ink-3)] flex-shrink-0 mt-1"><IconChevron down={expanded} /></span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--edk-border)]">

          {(delivery.deliveryAddress || delivery.deliveryNotes) && (
            <div className="px-4 py-3 bg-[var(--edk-bg)] border-b border-[var(--edk-border)] space-y-1.5">
              {delivery.deliveryAddress && (
                <div className="flex items-start gap-2 text-[12px] text-[var(--edk-ink-2)]">
                  <span className="text-[var(--edk-ink-3)] mt-0.5 flex-shrink-0"><IconMapPin /></span>
                  <span>{delivery.deliveryAddress}</span>
                </div>
              )}
              {delivery.deliveryNotes && (
                <div className="flex items-start gap-2 text-[12px] text-[var(--edk-ink-3)] italic">
                  <span className="text-[var(--edk-ink-3)] mt-0.5 flex-shrink-0"><IconClock /></span>
                  <span>{delivery.deliveryNotes}</span>
                </div>
              )}
            </div>
          )}

          <div className="px-4 py-3 border-b border-[var(--edk-border)]">
            <p className="text-[10px] font-bold text-[var(--edk-ink-3)] uppercase tracking-wider mb-2">Items</p>
            <div className="space-y-1.5">
              {delivery.lines.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {l.imageUrl && (
                      <img src={l.imageUrl} alt={l.name} className="w-7 h-7 rounded-lg object-cover flex-shrink-0 bg-[var(--edk-surface-2)]" />
                    )}
                    <span className="text-[12px] text-[var(--edk-ink-2)] truncate">
                      {l.name}{l.sizeCode ? ` · ${l.sizeCode}` : ''}
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--edk-ink)] flex-shrink-0 tabular-nums">
                    {l.qty > 1 ? `${l.qty} × ` : ''}{fmt(l.unitPrice)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 py-2.5 border-b border-[var(--edk-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--edk-ink-3)]">Sold {fmtTime(delivery.createdAt)}</span>
            <span className="text-[11px] font-medium text-[var(--edk-ink-3)]">{delivery.paymentMethod}</span>
          </div>

          {!isCancelled && delivery.deliveryStatus !== 'delivered' && (
            <div className="px-4 py-3 flex flex-wrap gap-2">
              {delivery.deliveryStatus === 'pending' && (
                <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => onMarkDispatched(delivery.id)} leftIcon={<IconTruck />} loading={loading}>
                  Mark Dispatched
                </Button>
              )}
              <Button type="button" variant="primary" size="sm" disabled={loading} onClick={() => onMarkDelivered(delivery.id)} leftIcon={<IconCheck />} loading={loading} className="bg-emerald-500 hover:bg-emerald-600 border-0">
                Mark Delivered
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={() => {
                if (window.confirm('Cancel this delivery? The order stays; only the delivery will be marked cancelled.')) {
                  onMarkCancelled(delivery.id);
                }
              }} loading={loading}>
                Cancel delivery
              </Button>
            </div>
          )}

          {isCancelled && (
            <div className="px-4 py-3 flex items-center gap-2 text-[var(--edk-ink-3)]">
              <span className="text-[12px] font-medium">Delivery cancelled. Sale remains recorded.</span>
            </div>
          )}

          {delivery.deliveryStatus === 'delivered' && delivery.deliveredAt && (
            <div className="px-4 py-3 flex items-center gap-2 text-[var(--edk-green)]">
              <IconCheck />
              <span className="text-[12px] font-medium">Delivered {fmtTime(delivery.deliveredAt)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function DeliveriesPage({ warehouseId: propWarehouseId = '', apiBaseUrl }: DeliveriesPageProps) {
  const { currentWarehouseId } = useWarehouse();
  const warehouseId = propWarehouseId || currentWarehouseId || '';
  const base = apiBaseUrl ?? API_BASE_URL;

  const [deliveries,     setDeliveries]     = useState<Delivery[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [filter,         setFilter]         = useState<Filter>('all');
  const [search,         setSearch]         = useState('');
  const [actionLoading,  setActionLoading]  = useState<string | null>(null);
  const [toast,          setToast]          = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const isMounted = useRef(true);

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => { if (isMounted.current) setToast(null); }, 3000);
  }

  // ── Load all pending + dispatched deliveries ────────────────────────────

  const load = useCallback(async (silent = false) => {
    if (!isValidWarehouseId(warehouseId)) {
      setLoading(false);
      setDeliveries([]);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const path = `/api/sales?warehouse_id=${encodeURIComponent(warehouseId)}&limit=200&pending=true`;
      const json = await apiGet<Delivery[] | { data: Delivery[] }>(base, path);
      // API returns array at root or { data }; accept both so deliveries list is never empty due to shape.
      const list = Array.isArray(json) ? json : (json?.data ?? []);
      if (isMounted.current) setDeliveries(list as Delivery[]);
    } catch (e: unknown) {
      if (isMounted.current) setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [warehouseId, base]);

  useEffect(() => { load(); }, [load]);

  // ── Action: mark dispatched / delivered / cancelled ─────────────────────

  async function updateStatus(saleId: string, newStatus: 'dispatched' | 'delivered' | 'cancelled') {
    if (!isValidWarehouseId(warehouseId)) return;
    setActionLoading(saleId);
    try {
      await apiPatch<unknown>(base, '/api/sales', { saleId, deliveryStatus: newStatus, warehouseId });
      // Optimistic update
      setDeliveries(prev =>
        newStatus === 'delivered'
          ? prev.filter(d => d.id !== saleId)
          : prev.map(d => d.id === saleId ? { ...d, deliveryStatus: newStatus } : d)
      );
      const msg = newStatus === 'delivered' ? '✓ Marked as delivered' : newStatus === 'dispatched' ? '✓ Marked as dispatched' : '✓ Delivery cancelled';
      showToast(msg, 'success');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Action failed', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  // ── Counts ───────────────────────────────────────────────────────────────

  const pendingCount    = deliveries.filter(d => d.deliveryStatus === 'pending').length;
  const dispatchedCount = deliveries.filter(d => d.deliveryStatus === 'dispatched').length;
  const cancelledCount   = deliveries.filter(d => d.deliveryStatus === 'cancelled').length;
  const overdueCount    = deliveries.filter(isOverdue).length;

  // ── Filtered list ────────────────────────────────────────────────────────

  const filtered = deliveries.filter(d => {
    const matchFilter =
      filter === 'all'        ? true :
      filter === 'pending'    ? d.deliveryStatus === 'pending' :
      filter === 'dispatched' ? d.deliveryStatus === 'dispatched' :
      filter === 'overdue'    ? isOverdue(d) :
      filter === 'cancelled'   ? d.deliveryStatus === 'cancelled' : true;

    if (!matchFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (d.recipientName  ?? '').toLowerCase().includes(q) ||
      (d.customerName   ?? '').toLowerCase().includes(q) ||
      (d.receiptId      ?? '').toLowerCase().includes(q) ||
      (d.recipientPhone ?? '').toLowerCase().includes(q) ||
      (d.deliveryAddress ?? '').toLowerCase().includes(q)
    );
  });

  // ── Render ───────────────────────────────────────────────────────────────

  const FILTER_PILLS: { label: string; count: number; activeClass: string; inactiveClass: string; active: boolean; key: Filter }[] = [
    { label: 'Pending',    count: pendingCount,    activeClass: 'bg-[var(--edk-amber-bg)] text-[var(--edk-amber)] border-[var(--edk-amber)]/30',   inactiveClass: 'bg-[var(--edk-surface)] border-[var(--edk-border)] text-[var(--edk-ink-3)] hover:border-[var(--edk-border-mid)]', active: filter === 'pending',    key: 'pending'    },
    { label: 'Dispatched', count: dispatchedCount, activeClass: 'bg-blue-50 text-blue-600 border-blue-200',   inactiveClass: 'bg-[var(--edk-surface)] border-[var(--edk-border)] text-[var(--edk-ink-3)] hover:border-[var(--edk-border-mid)]', active: filter === 'dispatched', key: 'dispatched' },
    { label: 'Overdue',    count: overdueCount,    activeClass: 'bg-[var(--edk-red-soft)] text-[var(--edk-red)] border-[var(--edk-red-border)]', inactiveClass: 'bg-[var(--edk-surface)] border-[var(--edk-border)] text-[var(--edk-ink-3)] hover:border-[var(--edk-border-mid)]', active: filter === 'overdue',    key: 'overdue'    },
    { label: 'Cancelled',  count: cancelledCount,  activeClass: 'bg-[var(--edk-surface-2)] text-[var(--edk-ink-2)] border-[var(--edk-border-mid)]', inactiveClass: 'bg-[var(--edk-surface)] border-[var(--edk-border)] text-[var(--edk-ink-3)] hover:border-[var(--edk-border-mid)]', active: filter === 'cancelled',   key: 'cancelled'  },
  ];

  return (
    <div className="min-h-screen bg-[var(--edk-bg)] pb-20">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-[var(--edk-radius)] text-[13px] font-semibold shadow-lg text-white transition-all ${toast.type === 'success' ? 'bg-[var(--edk-green)]' : 'bg-[var(--edk-red)]'}`}>
          {toast.msg}
        </div>
      )}

      <div className="sticky top-0 z-30 bg-[var(--edk-surface)] border-b border-[var(--edk-border)] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[20px] font-extrabold text-[var(--edk-ink)] tracking-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>Deliveries</h1>
            <p className="text-[12px] text-[var(--edk-ink-3)] mt-0.5">
              {pendingCount + dispatchedCount} active · {cancelledCount > 0 ? `${cancelledCount} cancelled` : ''} {overdueCount > 0 ? `· ${overdueCount} overdue` : ''}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => load(true)} className="min-w-[36px] h-9 px-0" aria-label="Refresh">
            <IconRefresh />
          </Button>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-0.5 no-scrollbar">
          {FILTER_PILLS.map(s => (
            <button key={s.key} type="button"
              onClick={() => setFilter(current => (current === s.key ? 'all' : s.key))}
              className={`flex-shrink-0 flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold transition-all border-[1.5px] ${s.active ? s.activeClass : s.inactiveClass}`}>
              <span>{s.label}</span>
              <span className={`w-4.5 h-4.5 rounded-full text-[10px] font-extrabold flex items-center justify-center ${s.active ? 'bg-current/20' : 'bg-[var(--edk-surface-2)]'}`}>{s.count}</span>
            </button>
          ))}
        </div>

        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--edk-ink-3)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, receipt, phone…"
            className="w-full h-10 pl-9 pr-4 bg-[var(--edk-surface-2)] rounded-xl font-sans text-[13px] text-[var(--edk-ink)] placeholder:text-[var(--edk-ink-3)] outline-none border border-transparent focus:bg-[var(--edk-surface)] focus:ring-[2px] focus:ring-[var(--edk-red-soft)] focus:border-[var(--edk-red-border)] transition-all"
          />
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--edk-ink-3)]">
            <IconSpinner />
            <p className="text-[13px] mt-3 font-medium">Loading deliveries…</p>
          </div>
        )}

        {!loading && error != null && error !== '' && (
          <div className="rounded-[var(--edk-radius)] border border-[var(--edk-red-border)] bg-[var(--edk-red-soft)] p-4 text-center">
            <p className="text-[13px] text-[var(--edk-ink)] font-medium">{error}</p>
            <Button type="button" variant="primary" size="sm" onClick={() => load()} className="mt-2">Retry</Button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            icon={Truck}
            title={search ? 'No results' : filter === 'cancelled' ? 'No cancelled deliveries' : 'No pending deliveries'}
            description={search ? 'Try a different search' : filter === 'cancelled' ? 'Cancelled deliveries will appear here' : 'Deliveries scheduled from the POS will appear here'}
          />
        )}

        {!loading && !error && filtered.map(d => (
          <DeliveryCard
            key={d.id}
            delivery={d}
            onMarkDispatched={id => updateStatus(id, 'dispatched')}
            onMarkDelivered={id  => updateStatus(id, 'delivered')}
            onMarkCancelled={id  => updateStatus(id, 'cancelled')}
            actionLoading={actionLoading}
          />
        ))}
      </div>

      <style>{`
        @keyframes del-spin { to { transform: rotate(360deg); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}
