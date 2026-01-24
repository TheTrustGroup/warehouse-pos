import { useState } from 'react';
import { WifiOff, ShoppingCart, Trash2 } from 'lucide-react';
import { usePOS } from '../contexts/POSContext';
import { ProductSearch } from '../components/pos/ProductSearch';
import { Cart } from '../components/pos/Cart';
import { PaymentPanel } from '../components/pos/PaymentPanel';
import { Receipt } from '../components/pos/Receipt';
import { Transaction, Payment } from '../types';

export function POS() {
  const { cart, clearCart, isOnline, processTransaction } = usePOS();
  const [showReceipt, setShowReceipt] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<Transaction | null>(null);

  const handleCompletePayment = async (payments: Payment[]) => {
    const transaction = await processTransaction(payments);
    setCompletedTransaction(transaction);
    setShowReceipt(true);
  };

  const handleNewSale = () => {
    setShowReceipt(false);
    setCompletedTransaction(null);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Point of Sale</h1>
        <p className="text-slate-500 text-sm">Process sales and transactions</p>
      </div>

      {/* Offline Banner */}
      {!isOnline && (
        <div className="glass-card bg-amber-50/80 border-amber-200/50 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100/80 rounded-lg">
              <WifiOff className="w-5 h-5 text-amber-600" strokeWidth={2} />
            </div>
            <div>
              <p className="font-semibold text-amber-900">Offline Mode</p>
              <p className="text-sm text-amber-700">Transactions will sync when online</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product Search */}
        <div className="lg:col-span-2">
          <div className="glass-card h-full">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Products</h2>
            <ProductSearch />
          </div>
        </div>

        {/* Right: Cart & Payment */}
        <div className="space-y-6">
          {/* Cart */}
          <div className="glass-card">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="w-6 h-6" strokeWidth={2} />
                Cart ({cart.length})
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="btn-action btn-action-delete"
                  title="Clear cart"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
            <Cart />
          </div>

          {/* Payment Panel */}
          {cart.length > 0 && (
            <div className="glass-card">
              <h2 className="text-xl font-semibold text-slate-900 mb-6">Payment</h2>
              <PaymentPanel onComplete={handleCompletePayment} />
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
