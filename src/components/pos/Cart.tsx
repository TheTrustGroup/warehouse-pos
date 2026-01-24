import { Trash2, Plus, Minus } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { formatCurrency } from '../../lib/utils';

export function Cart() {
  const { cart, updateCartItem, removeFromCart, calculateSubtotal, discount, calculateTax, calculateTotal } = usePOS();

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto space-y-3 mb-6">
        {cart.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-600 font-medium">Cart is empty</p>
            <p className="text-sm text-slate-500 mt-1">Add items to get started</p>
          </div>
        ) : (
          cart.map(item => (
            <div key={item.productId} className="glass-card p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-slate-900 truncate">{item.productName}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{item.sku}</p>
                </div>
                <button
                  onClick={() => removeFromCart(item.productId)}
                  className="btn-action btn-action-delete ml-2 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateCartItem(item.productId, item.quantity - 1)}
                    className="p-1.5 bg-white/80 rounded-lg border border-slate-200/60 hover:bg-white hover:border-primary-300 transition-all duration-200"
                  >
                    <Minus className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <span className="w-12 text-center font-semibold text-slate-900">{item.quantity}</span>
                  <button
                    onClick={() => updateCartItem(item.productId, item.quantity + 1)}
                    className="p-1.5 bg-white/80 rounded-lg border border-slate-200/60 hover:bg-white hover:border-primary-300 transition-all duration-200"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {formatCurrency(item.unitPrice)} × {item.quantity}
                  </p>
                  <p className="font-bold text-slate-900 text-base">
                    {formatCurrency(item.subtotal)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Summary */}
      {cart.length > 0 && (
        <div className="border-t border-slate-200/50 pt-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold text-slate-900">{formatCurrency(calculateSubtotal())}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-emerald-600 font-medium">Discount</span>
              <span className="font-semibold text-emerald-600">-{formatCurrency(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">VAT (15%)</span>
            <span className="font-semibold text-slate-900">{formatCurrency(calculateTax())}</span>
          </div>
          <div className="flex justify-between text-xl font-bold pt-3 border-t border-slate-200/50">
            <span className="text-slate-900">Total</span>
            <span className="gradient-text">{formatCurrency(calculateTotal())}</span>
          </div>
        </div>
      )}
    </div>
  );
}
