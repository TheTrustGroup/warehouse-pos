import { useState } from 'react';
import { useOrders } from '../contexts/OrderContext';
import { OrderStatus } from '../types/order';
import {
  Package,
  Clock,
  Truck,
  CheckCircle,
  XCircle,
  Plus,
  Search,
} from 'lucide-react';
import { formatCurrency, formatDateTime } from '../lib/utils';

export function Orders() {
  const {
    orders,
    isLoading,
    updateOrderStatus,
    assignDriver,
    markAsDelivered,
    markAsFailed,
  } = useOrders();

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  const getStatusColor = (status: OrderStatus) => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
      processing: 'bg-purple-50 text-purple-700 border-purple-200',
      ready: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      out_for_delivery: 'bg-orange-50 text-orange-700 border-orange-200',
      delivered: 'bg-green-50 text-green-700 border-green-200',
      failed: 'bg-red-50 text-red-700 border-red-200',
      cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return colors[status];
  };

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Orders</h1>
          <p className="text-slate-600 text-sm mt-0.5">{filteredOrders.length} orders found</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New Order
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-50 rounded-xl">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Pending</p>
              <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-xl">
              <Package className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Processing</p>
              <p className="text-2xl font-bold text-slate-900">{stats.processing}</p>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 rounded-xl">
              <Truck className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Out for Delivery</p>
              <p className="text-2xl font-bold text-slate-900">{stats.out_for_delivery}</p>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Delivered</p>
              <p className="text-2xl font-bold text-slate-900">{stats.delivered}</p>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 rounded-xl">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-600">Failed</p>
              <p className="text-2xl font-bold text-slate-900">{stats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by order number, customer name or phone..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

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

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map(order => (
          <div key={order.id} className="glass-card hover:shadow-xl transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-bold text-slate-900">{order.orderNumber}</h3>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(order.status)}`}
                  >
                    {order.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Customer</p>
                    <p className="font-medium text-slate-900">{order.customer.name}</p>
                    <p className="text-slate-600">{order.customer.phone}</p>
                  </div>

                  <div>
                    <p className="text-slate-500">Order Date</p>
                    <p className="font-medium text-slate-900">{formatDateTime(order.createdAt)}</p>
                  </div>

                  <div>
                    <p className="text-slate-500">Total Amount</p>
                    <p className="text-xl font-bold text-primary-600">{formatCurrency(order.total)}</p>
                  </div>
                </div>

                {order.delivery?.driverName && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-900">
                      <Truck className="w-4 h-4 inline mr-2" />
                      Driver: <strong>{order.delivery.driverName}</strong> ({order.delivery.driverPhone})
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {order.status === 'pending' && (
                  <button
                    onClick={() => updateOrderStatus(order.id, 'confirmed')}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Confirm
                  </button>
                )}

                {(order.status === 'confirmed' || order.status === 'processing') && (
                  <button
                    onClick={() => updateOrderStatus(order.id, 'ready')}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
                  >
                    Mark Ready
                  </button>
                )}

                {order.status === 'ready' && (
                  <button
                    onClick={() => {
                      const driver = prompt('Enter driver name:');
                      const phone = prompt('Enter driver phone:');
                      if (driver && phone) {
                        assignDriver(order.id, driver, phone);
                      }
                    }}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium"
                  >
                    Assign Driver
                  </button>
                )}

                {order.status === 'out_for_delivery' && (
                  <>
                    <button
                      onClick={() =>
                        markAsDelivered(order.id, { recipientName: order.customer.name })
                      }
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      Mark Delivered
                    </button>
                    <button
                      onClick={() => {
                        const reason = prompt('Reason for failure:');
                        if (reason) markAsFailed(order.id, reason);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                      Mark Failed
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="border-t border-slate-200 pt-3">
              <p className="text-sm font-medium text-slate-700 mb-2">Items ({order.items.length})</p>
              <div className="space-y-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      {item.productName} × {item.quantity}
                    </span>
                    <span className="font-medium text-slate-900">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {filteredOrders.length === 0 && (
          <div className="glass-card text-center py-12">
            <Package className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No orders found</h3>
            <p className="text-slate-600">Try adjusting your filters or create a new order</p>
          </div>
        )}
      </div>
    </div>
  );
}
