import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../contexts/OrderContext';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useNetworkStatusContext } from '../contexts/NetworkStatusContext';
import { OrderStatus } from '../types/order';
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  Plus,
  Search,
  AlertTriangle,
  RefreshCw,
  ClipboardList,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';

export function Orders() {
  const {
    orders,
    isLoading,
    error: ordersError,
    busyOrderId,
    updateOrderStatus,
    assignDriver,
    markAsDelivered,
    markAsFailed,
    cancelOrder,
    refreshOrders,
  } = useOrders();
  const { isDegraded } = useApiStatus();
  const { isOnline } = useNetworkStatusContext();
  const navigate = useNavigate();
  /** Phase 5: last saved data mode is read-only. Disable status updates (e.g. deduct stock) when server unreachable or offline. */
  const readOnlyMode = isDegraded || !isOnline;

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  /** Statuses that allow cancellation (not delivered, failed, or already cancelled). */
  const CANCELLABLE_STATUSES: OrderStatus[] = [
    'pending',
    'confirmed',
    'processing',
    'ready',
    'out_for_delivery',
  ];
  const isCancellable = (status: OrderStatus) => CANCELLABLE_STATUSES.includes(status);

  // Filter orders
  const filteredOrders = orders.filter(order => {
    const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer.phone.includes(searchQuery);

    return matchesStatus && matchesSearch;
  });

  // Status statistics
  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    out_for_delivery: orders.filter(o => o.status === 'out_for_delivery').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    failed: orders.filter(o => o.status === 'failed').length,
  };

  const getStatusBadgeVariant = (status: OrderStatus): 'success' | 'warning' | 'danger' | 'gray' | 'red' | 'blue' => {
    const map: Record<OrderStatus, 'success' | 'warning' | 'danger' | 'gray' | 'red' | 'blue'> = {
      pending: 'warning',
      confirmed: 'blue',
      processing: 'blue',
      ready: 'blue',
      out_for_delivery: 'warning',
      delivered: 'success',
      failed: 'danger',
      cancelled: 'gray',
    };
    return map[status];
  };

  if (isLoading) {
    return (
      <div className="space-y-6 min-h-[60dvh] bg-[var(--edk-bg)] p-4 sm:p-6" role="status" aria-live="polite">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-32 bg-[var(--edk-border-mid)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[var(--edk-border-mid)] rounded mt-2 animate-pulse" />
          </div>
          <div className="h-12 w-32 bg-[var(--edk-border-mid)] rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 bg-[var(--edk-border-mid)] rounded-xl animate-pulse flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-16 bg-[var(--edk-border-mid)] rounded mb-2 animate-pulse" />
                  <div className="h-7 w-10 bg-[var(--edk-border-mid)] rounded animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
          <div className="h-12 bg-[var(--edk-border-mid)] rounded-xl animate-pulse w-full max-w-md" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-[var(--edk-bg)] min-h-screen p-4 sm:p-6">
      {ordersError && (
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-amber)]/20 bg-[var(--edk-amber-bg)] px-4 py-3 flex flex-wrap items-center justify-between gap-3" role="alert">
          <p className="text-[var(--edk-ink)] text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-[var(--edk-amber)]" strokeWidth={2} aria-hidden />
            {ordersError}
          </p>
          <Button variant="primary" size="sm" onClick={() => refreshOrders()} leftIcon={<RefreshCw className="w-4 h-4" strokeWidth={2} />} className="shrink-0" aria-label="Retry loading orders">
            Retry
          </Button>
        </div>
      )}
      {!ordersError && orders.length === 0 ? (
        <div className="min-h-[50vh] flex flex-col justify-center">
          <EmptyState
            icon={ClipboardList}
            title="No orders yet"
            description="Orders will appear here when they are created from POS or delivery."
            action={
              <Button variant="primary" onClick={() => navigate('/pos')} leftIcon={<Plus className="w-5 h-5" strokeWidth={2} />}>
                Go to POS
              </Button>
            }
          />
        </div>
      ) : (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Orders"
          description={`${filteredOrders.length} order${filteredOrders.length !== 1 ? 's' : ''} found`}
        />
        <Button variant="primary" onClick={() => navigate('/pos')} leftIcon={<Plus className="w-5 h-5" strokeWidth={2} />} className="w-full sm:w-auto justify-center" aria-label="New order">
          New Order
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-[7.5rem] flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--edk-amber-bg)] rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-[var(--edk-amber)]" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--edk-ink-3)]">Pending</p>
              <p className="text-2xl font-bold text-[var(--edk-ink)] tabular-nums">{stats.pending}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-[7.5rem] flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-6 h-6 text-blue-600" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--edk-ink-3)]">Processing</p>
              <p className="text-2xl font-bold text-[var(--edk-ink)] tabular-nums">{stats.processing}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-[7.5rem] flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--edk-amber-bg)] rounded-xl flex items-center justify-center shrink-0">
              <Truck className="w-6 h-6 text-[var(--edk-amber)]" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--edk-ink-3)]">Out for Delivery</p>
              <p className="text-2xl font-bold text-[var(--edk-ink)] tabular-nums">{stats.out_for_delivery}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-[7.5rem] flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--edk-green-bg)] rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-6 h-6 text-[var(--edk-green)]" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--edk-ink-3)]">Delivered</p>
              <p className="text-2xl font-bold text-[var(--edk-ink)] tabular-nums">{stats.delivered}</p>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] min-h-[7.5rem] flex flex-col justify-center p-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[var(--edk-red-soft)] rounded-xl flex items-center justify-center shrink-0">
              <XCircle className="w-6 h-6 text-[var(--edk-red)]" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-[var(--edk-ink-3)]">Failed</p>
              <p className="text-2xl font-bold text-[var(--edk-ink)] tabular-nums">{stats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-[var(--edk-ink-2)] mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--edk-ink-3)] pointer-events-none" strokeWidth={2} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Order number, customer, phone..."
                className="input-field w-full pl-10 pr-4"
                aria-label="Search orders"
              />
            </div>
          </div>

          <div className="input-select-wrapper min-w-[140px]">
            <label className="block text-sm font-medium text-[var(--edk-ink-2)] mb-1.5">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value as OrderStatus | 'all')}
              className="input-field"
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="out_for_delivery">Out for Delivery</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredOrders.map(order => (
          <div key={order.id} className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold text-[var(--edk-ink)]">{order.orderNumber}</h3>
                  <Badge variant={getStatusBadgeVariant(order.status)} size="md">
                    {order.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-[var(--edk-ink-3)]">Customer</p>
                    <p className="font-medium text-[var(--edk-ink)]">{order.customer.name}</p>
                    <p className="text-[var(--edk-ink-2)]">{order.customer.phone}</p>
                  </div>
                  <div>
                    <p className="text-[var(--edk-ink-3)]">Order Date</p>
                    <p className="font-medium text-[var(--edk-ink)]">{formatDateTime(order.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[var(--edk-ink-3)]">Total Amount</p>
                    <p className="text-xl font-bold text-[var(--edk-red)]">{formatCurrency(order.total)}</p>
                  </div>
                </div>

                {order.delivery?.driverName && (
                  <div className="mt-3 p-3 rounded-[var(--edk-radius-sm)] bg-[var(--edk-surface-2)] border border-[var(--edk-border-mid)]">
                    <p className="text-sm text-[var(--edk-ink-2)]">
                      <Truck className="w-4 h-4 inline mr-2" strokeWidth={2} />
                      Driver: <strong>{order.delivery.driverName}</strong> ({order.delivery.driverPhone})
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {order.status === 'pending' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => updateOrderStatus(order.id, 'confirmed')}
                    disabled={readOnlyMode || busyOrderId === order.id}
                    loading={busyOrderId === order.id}
                    title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
                  >
                    Confirm
                  </Button>
                )}
                {(order.status === 'confirmed' || order.status === 'processing') && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => updateOrderStatus(order.id, 'ready')}
                    disabled={readOnlyMode || busyOrderId === order.id}
                    loading={busyOrderId === order.id}
                    title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
                  >
                    Mark Ready
                  </Button>
                )}
                {order.status === 'ready' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      const driver = prompt('Enter driver name:');
                      const phone = prompt('Enter driver phone:');
                      if (driver && phone) assignDriver(order.id, driver, phone);
                    }}
                    disabled={readOnlyMode || busyOrderId === order.id}
                    loading={busyOrderId === order.id}
                    title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
                  >
                    Assign Driver
                  </Button>
                )}
                {order.status === 'out_for_delivery' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => markAsDelivered(order.id, { recipientName: order.customer.name })}
                      disabled={readOnlyMode || busyOrderId === order.id}
                      loading={busyOrderId === order.id}
                      title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
                    >
                      Mark Delivered
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        const reason = prompt('Reason for failure:');
                        if (reason) markAsFailed(order.id, reason);
                      }}
                      disabled={readOnlyMode || busyOrderId === order.id}
                      loading={busyOrderId === order.id}
                      title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : undefined}
                    >
                      Mark Failed
                    </Button>
                  </>
                )}
                {isCancellable(order.status) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const reason = prompt('Reason for cancellation (optional):') ?? '';
                      cancelOrder(order.id, reason.trim() || 'Cancelled by user');
                    }}
                    disabled={readOnlyMode || busyOrderId === order.id}
                    loading={busyOrderId === order.id}
                    title={readOnlyMode ? 'Read-only. Writes disabled until connection is restored.' : 'Cancel this order and return stock if already deducted'}
                  >
                    Cancel order
                  </Button>
                )}
              </div>
            </div>

            <div className="border-t border-[var(--edk-border)] pt-3">
              <p className="text-sm font-medium text-[var(--edk-ink-2)] mb-2">Items ({order.items.length})</p>
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-[var(--edk-ink-2)]">
                      {item.productName} × {item.quantity}
                    </span>
                    <span className="font-medium text-[var(--edk-ink)]">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <EmptyState
            icon={Package}
            title="No orders found"
            description="Try adjusting your filters or create a new order."
            action={
              <Button variant="primary" onClick={() => navigate('/pos')} leftIcon={<Plus className="w-5 h-5" strokeWidth={2} />}>
                New Order
              </Button>
            }
          />
        )}
      </div>
        </>
      )}
    </div>
  );
}
