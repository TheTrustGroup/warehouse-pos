import { useState } from 'react';
import { WifiOff, ShoppingCart, Trash2, MapPin } from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { useOrders } from '../contexts/OrderContext';
import { useToast } from '../contexts/ToastContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { ProductSearch } from '../components/pos/ProductSearch';
import { Cart } from '../components/pos/Cart';
import { PaymentPanel } from '../components/pos/PaymentPanel';
import { Receipt } from '../components/pos/Receipt';
import { Transaction, Payment } from '../types';

const DELIVERY_FEE = 20;

export function POS() {
  const { cart, clearCart, isOnline, processTransaction, calculateSubtotal, calculateTax, calculateTotal, discount, pendingSyncCount } = usePOS();
  const { createOrder } = useOrders();
  const { showToast } = useToast();
  const { warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse } = useWarehouse();
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);

  /** POS requires warehouse selection when multiple warehouses exist. No silent default. */
  const warehouseRequired = warehouses.length > 1 && !currentWarehouseId;
  const canCompleteSale = !warehouseRequired && !!currentWarehouseId;

  const handleCreateOrder = async () => {
    if (cart.length === 0) {
      showToast('error', 'Cart is empty');
      return;
    }

    const customerName = prompt('Customer Name:');
    const customerPhone = prompt('Customer Phone:');
    const customerAddress = prompt('Delivery Address:');

    if (!customerName || !customerPhone) {
      showToast('error', 'Customer information required');
      return;
    }

    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const totalWithDelivery = calculateTotal() + DELIVERY_FEE;

    const orderData = {
      type: 'delivery' as const,
      customer: {
        name: customerName,
        phone: customerPhone,
        isRegistered: false,
        address: customerAddress
          ? {
              street: customerAddress,
              area: '',
              city: 'Accra',
            }
          : undefined,
      },
      items: cart.map(item => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
      subtotal,
      deliveryFee: DELIVERY_FEE,
      tax,
      discount,
      total: totalWithDelivery,
      payment: {
        method: 'cash_on_delivery' as const,
        status: 'pending' as const,
        paidAmount: 0,
      },
    };

    try {
      const order = await createOrder(orderData);
      showToast('success', `Order ${order.orderNumber} created successfully`);
      clearCart();
    } catch {
      showToast('error', 'Failed to create order');
    }
  };

  const handleCompletePayment = async (payments: Payment[]) => {
    try {
      const transaction = await processTransaction(payments);
      setCompletedTransaction(transaction);
      setShowReceipt(true);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Sale could not be completed. Please try again.');
    }
  };

  const handleNewSale = () => {
    setShowReceipt(false);
    setCompletedTransaction(null);
  };

  /* POS: one primary action = Complete Payment; cart + totals always visible; destructive (clear cart) separated */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Point of Sale</h1>
        <p className="text-slate-500 text-sm">Process sales and transactions</p>
      </div>

      {warehouseRequired && (
        <div className="glass-card bg-amber-50/80 border border-amber-200/50 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <MapPin className="w-5 h-5 text-amber-600 flex-shrink-0" strokeWidth={2} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-900">Select warehouse</p>
              <p className="text-sm text-amber-700 mt-0.5">Choose location before adding items or payment.</p>
              <select
                value=""
                onChange={(e) => setCurrentWarehouseId(e.target.value)}
                className="mt-3 input-field w-full max-w-xs bg-white border-amber-300 min-h-touch"
                aria-label="Select warehouse"
              >
                <option value="">— Select warehouse —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {currentWarehouse && !warehouseRequired && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm">
          <MapPin className="w-4 h-4" aria-hidden />
          <span>Selling from: <strong>{currentWarehouse.name}</strong></span>
          {warehouses.length > 1 && (
            <select
              value={currentWarehouseId}
              onChange={(e) => setCurrentWarehouseId(e.target.value)}
              className="min-h-touch text-sm border border-slate-200 rounded-xl px-3 py-2 bg-white"
              aria-label="Change warehouse"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!isOnline && (
        <div className="glass-card bg-amber-50/80 border border-amber-200/50 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <WifiOff className="w-5 h-5 text-amber-600" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <p className="font-medium text-amber-900">Offline</p>
              <p className="text-sm text-amber-700">Connect to complete the sale.</p>
            </div>
          </div>
        </div>
      )}

      {isOnline && pendingSyncCount > 0 && (
        <div className="glass-card bg-amber-50/80 border border-amber-200/50 p-4">
          <p className="font-medium text-amber-900">{pendingSyncCount} transaction(s) pending sync</p>
          <p className="text-sm text-amber-700 mt-0.5">They will retry when the server is available.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-x-hidden">
        <div className="lg:col-span-2 min-w-0">
          <div className="glass-card h-full p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Products</h2>
            <ProductSearch />
          </div>
        </div>

        <div className="space-y-5">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-slate-600" strokeWidth={2} aria-hidden />
                Cart ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="btn-action btn-action-delete"
                  title="Clear cart"
                  aria-label="Clear cart"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            <Cart />
          </div>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={handleCreateOrder}
              className="btn-secondary w-full"
            >
              Create delivery order
            </button>
          )}

          {cart.length > 0 && (
            <div className="glass-card p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Payment</h2>
              {canCompleteSale ? (
                <PaymentPanel onComplete={handleCompletePayment} />
              ) : (
                <p className="text-amber-700 text-sm">Select a warehouse above to complete payment.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Receipt Modal */}
      {showReceipt && completedTransaction && (
        <Receipt
          transaction={completedTransaction}
          onClose={handleNewSale}
        />
      )}
    </div>
  );
}
