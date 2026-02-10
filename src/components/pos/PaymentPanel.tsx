import { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Payment } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface PaymentPanelProps {
  onComplete: (payments: Payment[]) => void;
}

export function PaymentPanel({ onComplete }: PaymentPanelProps) {
  const { calculateTotal, calculateSubtotal, discount, setDiscount } = usePOS();
  const { canPerformAction, requireApproval } = useAuth();
  const { showToast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'mobile_money'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [discountInput, setDiscountInput] = useState('');

  const total = calculateTotal();
  const cashAmount = parseFloat(cashReceived) || 0;
  const change = cashAmount - total;

  const quickAmounts = [10, 20, 50, 100, 200, 500];

  const handleQuickAmount = (amount: number) => {
    setCashReceived(amount.toString());
  };

  const handlePayment = () => {
    const payments: Payment[] = [{
      method: paymentMethod,
      amount: total,
    }];

    onComplete(payments);
  };

  const handleDiscountApply = async () => {
    const discountValue = parseFloat(discountInput) || 0;
    if (discountValue <= 0) {
      setDiscountInput('');
      return;
    }

    const subtotal = calculateSubtotal();
    const discountPercent = subtotal > 0 ? (discountValue / subtotal) * 100 : 0;
    const { allowed, needsApproval } = canPerformAction('discount', discountPercent);

    if (!allowed && needsApproval) {
      const approved = await requireApproval(
        'Apply Discount',
        `Discount ${discountPercent.toFixed(1)}% (${formatCurrency(discountValue)}) exceeds your limit`
      );
      if (!approved) {
        showToast('error', 'Discount approval denied');
        return;
      }
    } else if (!allowed) {
      showToast('error', 'You cannot apply this discount. Limit exceeded.');
      return;
    }

    setDiscount(discountValue);
    setDiscountInput('');
  };

  /* One primary action = Complete payment; discount/payment method secondary; quick amounts ≥44px */
  return (
    <div className="space-y-5">
      <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/50">
        <label className="block text-sm font-medium text-slate-600 mb-2">Discount</label>
        <div className="flex gap-2 flex-wrap">
          <input
            type="number"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            placeholder="Amount"
            className="input-field flex-1 min-w-0 min-h-touch"
            aria-label="Discount amount"
          />
          <button type="button" onClick={handleDiscountApply} className="btn-secondary px-4 min-h-touch">
            Apply
          </button>
        </div>
        {discount > 0 && (
          <div className="mt-3 flex items-center justify-between text-sm p-3 bg-emerald-50 rounded-lg border border-emerald-200/50">
            <span className="text-emerald-700 font-medium">Discount: {formatCurrency(discount)}</span>
            <button type="button" onClick={() => setDiscount(0)} className="btn-action btn-action-delete" aria-label="Remove discount">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-600 mb-2">Payment method</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'cash' as const, Icon: Banknote, label: 'Cash' },
            { id: 'card' as const, Icon: CreditCard, label: 'Card' },
            { id: 'mobile_money' as const, Icon: Smartphone, label: 'Mobile' },
          ].map(({ id, Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPaymentMethod(id)}
              className={`min-h-touch flex flex-col items-center justify-center gap-1 rounded-xl border-2 transition-colors ${
                paymentMethod === id
                  ? 'border-primary-500 bg-primary-50 text-primary-600'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
              }`}
              aria-pressed={paymentMethod === id}
              aria-label={label}
            >
              <Icon className="w-5 h-5" strokeWidth={2} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {paymentMethod === 'cash' && (
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Cash received</label>
          <input
            type="number"
            value={cashReceived}
            onChange={(e) => setCashReceived(e.target.value)}
            placeholder="Amount"
            className="input-field w-full text-lg mb-3 min-h-touch"
            aria-label="Cash received"
          />
          <div className="grid grid-cols-3 gap-2 mb-3">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => handleQuickAmount(amount)}
                className="min-h-touch py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-medium text-slate-800 transition-colors"
              >
                ₵{amount}
              </button>
            ))}
          </div>
          {cashReceived && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200/50 p-3">
              <div className="flex justify-between items-center">
                <span className="text-emerald-800 font-medium">Change</span>
                <span className="text-xl font-bold text-emerald-700">{change >= 0 ? formatCurrency(change) : formatCurrency(0)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handlePayment}
        disabled={paymentMethod === 'cash' && cashAmount < total}
        className="btn-primary w-full py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label={`Complete payment ${formatCurrency(total)}`}
      >
        Complete sale — {formatCurrency(total)}
      </button>
    </div>
  );
}
