import { useState } from 'react';
import { WifiOff, ShoppingCart, Trash2, MapPin, Lock, Store, RefreshCw } from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { useApiStatus } from '../contexts/ApiStatusContext';
import { useOrders } from '../contexts/OrderContext';
import { useToast } from '../contexts/ToastContext';
import { useWarehouse } from '../contexts/WarehouseContext';
import { useStore } from '../contexts/StoreContext';
import { useAuth } from '../contexts/AuthContext';
import { ProductSearch } from '../components/pos/ProductSearch';
import { Cart } from '../components/pos/Cart';
import { PaymentPanel } from '../components/pos/PaymentPanel';
import { Receipt } from '../components/pos/Receipt';
import { Button } from '../components/ui/Button';
import { getUserFriendlyMessage } from '../lib/errorMessages';
import { Transaction, Payment } from '../types';

const DELIVERY_FEE = 20;

export function POS() {
  const { cart, clearCart, isOnline, processTransaction, calculateSubtotal, calculateTax, calculateTotal, discount, pendingSyncCount, syncNow } = usePOS();
  const { isDegraded } = useApiStatus();
  const { createOrder } = useOrders();
  /** Phase 5: last saved data mode is read-only. Disable Complete sale when server unreachable or offline. */
  const readOnlyMode = isDegraded || !isOnline;
  const { showToast } = useToast();
  const { warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse, isWarehouseBoundToSession } = useWarehouse();
  const { stores, currentStoreId, setCurrentStoreId, currentStore, isSingleStore } = useStore();
  const { user } = useAuth();
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);

  /** User is assigned to Main Town POS only: show fixed "Main Town" text, no store/warehouse dropdowns. Fallback: single store named "Main town" when API doesn't return assignedPos. */
  const isMainTownPos =
    user?.assignedPos === 'main_town' ||
    (isSingleStore && currentStore?.name?.trim().toLowerCase() === 'main town');
  /** User has one assigned POS (one store + one warehouse): show fixed location only, no dropdowns. */
  const hasSinglePOSLocation = !isMainTownPos && isSingleStore && warehouses.length === 1;
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
      showToast('error', getUserFriendlyMessage(err));
    }
  };

  const handleNewSale = () => {
    setShowReceipt(false);
    setCompletedTransaction(null);
  };

  /* POS: one primary action = Complete Payment; cart + totals always visible; show which store/warehouse. */
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Point of Sale</h1>
        <p className="text-slate-500 text-sm">Process sales and transactions</p>
        {(isMainTownPos || currentStore || currentWarehouse) && (
          <p className="text-sm text-slate-600 font-medium mt-1 flex items-center gap-2 flex-wrap">
            {isMainTownPos ? (
              <span><MapPin className="w-4 h-4 inline-block mr-1" aria-hidden />Main Town</span>
            ) : (
              <>
                {currentStore && <span><Store className="w-4 h-4 inline-block mr-1" aria-hidden />{currentStore.name}</span>}
                {currentStore && currentWarehouse && <span className="text-slate-400">•</span>}
                {currentWarehouse && <span><MapPin className="w-4 h-4 inline-block mr-1" aria-hidden />{currentWarehouse.name}</span>}
              </>
            )}
          </p>
        )}
      </div>

      {warehouseRequired && (
        <div className="solid-card bg-amber-50 border border-amber-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <MapPin className="w-5 h-5 text-amber-600 flex-shrink-0" strokeWidth={2} aria-hidden />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-amber-900">Select warehouse</p>
              <p className="text-sm text-amber-700 mt-0.5">Choose location before adding items or payment.</p>
              <select
                value=""
                onChange={(e) => setCurrentWarehouseId(e.target.value)}
                className="mt-3 input-field w-full max-w-xs bg-white border-amber-300"
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

      {/* Main Town POS: fixed "Selling from: Main Town" only — no store/location dropdowns. */}
      {isMainTownPos && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm">
          <MapPin className="w-4 h-4" aria-hidden />
          <span>Selling from: <strong>Main Town</strong></span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600" title="Assigned to Main Town only">
            <Lock className="w-3.5 h-3.5" aria-hidden />
            <span>Assigned POS</span>
          </span>
        </div>
      )}

      {/* When user has a single assigned POS (not Main Town), show fixed store + warehouse — no dropdowns. */}
      {!isMainTownPos && hasSinglePOSLocation && currentStore && currentWarehouse && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm">
          <Store className="w-4 h-4" aria-hidden />
          <span>Store: <strong>{currentStore.name}</strong></span>
          <span className="text-slate-400">•</span>
          <MapPin className="w-4 h-4" aria-hidden />
          <span>Selling from: <strong>{currentWarehouse.name}</strong></span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600" title="Assigned to this location only">
            <Lock className="w-3.5 h-3.5" aria-hidden />
            <span>Assigned POS</span>
          </span>
        </div>
      )}

      {!isMainTownPos && !hasSinglePOSLocation && stores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm">
          <Store className="w-4 h-4" aria-hidden />
          {isSingleStore && currentStore ? (
            <span>Store: <strong>{currentStore.name}</strong></span>
          ) : stores.length > 1 ? (
            <>
              <span>Store:</span>
              <select
                value={currentStoreId ?? ''}
                onChange={(e) => setCurrentStoreId(e.target.value || null)}
                className="input-field text-sm bg-white w-full sm:max-w-[180px] min-w-0"
                aria-label="Select store"
              >
                <option value="">— Select store —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      )}

      {!isMainTownPos && !hasSinglePOSLocation && currentWarehouse && !warehouseRequired && (
        <div className="flex flex-wrap items-center gap-2 text-slate-600 text-sm">
          <MapPin className="w-4 h-4" aria-hidden />
          <span>Selling from: <strong>{currentWarehouse.name}</strong></span>
          {isWarehouseBoundToSession && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600" title="This session is bound to this warehouse">
              <Lock className="w-3.5 h-3.5" aria-hidden />
              <span>Bound to location</span>
            </span>
          )}
          {!isWarehouseBoundToSession && warehouses.length > 1 && (
            <select
              value={currentWarehouseId}
              onChange={(e) => setCurrentWarehouseId(e.target.value)}
              className="input-field text-sm bg-white w-full sm:max-w-[180px] min-w-0"
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
        <div className="solid-card bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg flex-shrink-0">
              <WifiOff className="w-5 h-5 text-amber-600" strokeWidth={2} aria-hidden />
            </div>
            <div>
              <p className="font-medium text-amber-900">Offline</p>
              <p className="text-sm text-amber-700">Sales are saved locally and will sync when connection is restored.</p>
            </div>
          </div>
        </div>
      )}

      {pendingSyncCount > 0 && (
        <div className="solid-card bg-amber-50 border border-amber-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="font-medium text-amber-900">{pendingSyncCount} sale(s) pending or failed sync</p>
              <p className="text-sm text-amber-700 mt-0.5">Sync when online or tap Sync now. Failed items may need admin review.</p>
            </div>
            {isOnline && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => syncNow()}
                className="inline-flex items-center gap-2 self-start sm:self-center"
                aria-label="Sync pending sales now"
              >
                <RefreshCw className="w-4 h-4" aria-hidden />
                Sync now
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-x-hidden">
        <div className="lg:col-span-2 min-w-0">
          <div className="solid-card h-full p-5">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Products</h2>
            <ProductSearch />
          </div>
        </div>

        <div className="space-y-5">
          <div className="solid-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-slate-600" strokeWidth={2} aria-hidden />
                Cart ({cart.length})
              </h2>
              {cart.length > 0 && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={clearCart}
                  title="Clear cart"
                  aria-label="Clear cart"
                >
                  <Trash2 className="w-5 h-5" />
                </Button>
              )}
            </div>
            <Cart />
          </div>

          {cart.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleCreateOrder}
              className="w-full"
            >
              Create delivery order
            </Button>
          )}

          {cart.length > 0 && (
            <div className="solid-card p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Payment</h2>
              {canCompleteSale ? (
                <PaymentPanel onComplete={handleCompletePayment} disableComplete={readOnlyMode} />
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
