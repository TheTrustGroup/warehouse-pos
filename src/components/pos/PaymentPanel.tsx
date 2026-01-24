import { useState } from 'react';
import { CreditCard, Banknote, Smartphone, X } from 'lucide-react';
import { usePOS } from '../../contexts/POSContext';
import { Payment } from '../../types';
import { formatCurrency } from '../../lib/utils';

interface PaymentPanelProps {
  onComplete: (payments: Payment[]) => void;
}

export function PaymentPanel({ onComplete }: PaymentPanelProps) {
  const { calculateTotal, discount, setDiscount } = usePOS();
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

  const handleDiscountApply = () => {
    const discountValue = parseFloat(discountInput) || 0;
    setDiscount(discountValue);
    setDiscountInput('');
  };

  return (
    <div className="space-y-6">
      {/* Discount Section */}
      <div className="glass-card p-4">
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          Apply Discount
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={discountInput}
            onChange={e => setDiscountInput(e.target.value)}
            placeholder="Enter discount amount"
            className="input-field flex-1"
          />
          <button
            onClick={handleDiscountApply}
            className="btn-primary px-6"
          >
            Apply
          </button>
        </div>
        {discount > 0 && (
          <div className="mt-3 flex items-center justify-between text-sm p-3 bg-emerald-50/80 rounded-lg border border-emerald-200/30">
            <span className="text-emerald-700 font-semibold">Current discount: {formatCurrency(discount)}</span>
            <button
              onClick={() => setDiscount(0)}
              className="btn-action btn-action-delete"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Payment Method Selection */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-3">
          Payment Method
        </label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setPaymentMethod('cash')}
            className={`p-4 rounded-xl border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              paymentMethod === 'cash'
                ? 'border-primary-600 bg-primary-50/80 shadow-primary'
                : 'border-slate-200/60 hover:border-primary-300 bg-white/80'
            }`}
          >
            <Banknote className={`w-6 h-6 mx-auto mb-2 ${paymentMethod === 'cash' ? 'text-primary-600' : 'text-slate-600'}`} strokeWidth={2} />
            <p className="text-sm font-semibold">Cash</p>
          </button>
          <button
            onClick={() => setPaymentMethod('card')}
            className={`p-4 rounded-xl border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              paymentMethod === 'card'
                ? 'border-primary-600 bg-primary-50/80 shadow-primary'
                : 'border-slate-200/60 hover:border-primary-300 bg-white/80'
            }`}
          >
            <CreditCard className={`w-6 h-6 mx-auto mb-2 ${paymentMethod === 'card' ? 'text-primary-600' : 'text-slate-600'}`} strokeWidth={2} />
            <p className="text-sm font-semibold">Card</p>
          </button>
          <button
            onClick={() => setPaymentMethod('mobile_money')}
            className={`p-4 rounded-xl border-2 transition-all duration-200 hover:-translate-y-0.5 ${
              paymentMethod === 'mobile_money'
                ? 'border-primary-600 bg-primary-50/80 shadow-primary'
                : 'border-slate-200/60 hover:border-primary-300 bg-white/80'
            }`}
          >
            <Smartphone className={`w-6 h-6 mx-auto mb-2 ${paymentMethod === 'mobile_money' ? 'text-primary-600' : 'text-slate-600'}`} strokeWidth={2} />
            <p className="text-sm font-semibold">Mobile Money</p>
          </button>
        </div>
      </div>

      {/* Cash Payment */}
      {paymentMethod === 'cash' && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-3">
            Cash Received
          </label>
          <input
            type="number"
            value={cashReceived}
            onChange={e => setCashReceived(e.target.value)}
            placeholder="Enter amount"
            className="input-field w-full text-lg mb-4"
          />
          
          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {quickAmounts.map(amount => (
              <button
                key={amount}
                onClick={() => handleQuickAmount(amount)}
                className="py-2.5 bg-slate-100/80 hover:bg-slate-200/80 rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5"
              >
                ₵{amount}
              </button>
            ))}
          </div>

          {/* Change Calculation */}
          {cashReceived && (
            <div className="glass-card bg-emerald-50/80 border-emerald-200/50 p-4">
              <div className="flex justify-between items-center">
                <span className="text-emerald-900 font-semibold">Change</span>
                <span className="text-2xl font-bold gradient-text">
                  {change >= 0 ? formatCurrency(change) : formatCurrency(0)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complete Payment Button */}
      <button
        onClick={handlePayment}
        disabled={paymentMethod === 'cash' && cashAmount < total}
        className="btn-primary w-full py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Complete Payment - {formatCurrency(total)}
      </button>
    </div>
  );
}
