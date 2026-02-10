import { Trash2, Plus, Minus } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { formatCurrency } from '../../lib/utils';

/** Cart: line-item spacing, quantity controls ≥44px, totals always visible at bottom (sticky in column). */
export function Cart() {
  const { cart, updateCartItem, removeFromCart, calculateSubtotal, discount, calculateTax, calculateTotal } = usePOS();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {cart.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-600 text-sm font-medium">Cart is empty</p>
            <p className="text-slate-500 text-sm mt-0.5">Add items to get started</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.productId} className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/50">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-900 truncate">{item.productName}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{item.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                  className="btn-action btn-action-delete flex-shrink-0"
                  aria-label={`Remove ${item.productName} from cart`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateCartItem(item.productId, item.quantity - 1)}
                    className="min-w-touch min-h-touch flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <span className="w-10 text-center font-medium text-slate-900 text-sm" aria-live="polite">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateCartItem(item.productId, item.quantity + 1)}
                    className="min-w-touch min-h-touch flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">{formatCurrency(item.unitPrice)} × {item.quantity}</p>
                  <p className="font-semibold text-slate-900">{formatCurrency(item.subtotal)}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Totals always visible when cart has items */}
      {cart.length > 0 && (
        <div className="border-t border-slate-200 pt-4 space-y-2 flex-shrink-0">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-slate-900">{formatCurrency(calculateSubtotal())}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-emerald-600">Discount</span>
              <span className="font-medium text-emerald-600">-{formatCurrency(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">VAT (15%)</span>
            <span className="font-medium text-slate-900">{formatCurrency(calculateTax())}</span>
          </div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-200">
            <span className="text-slate-900">Total</span>
            <span className="text-primary-600">{formatCurrency(calculateTotal())}</span>
          </div>
        </div>
      )}
    </div>
  );
}
