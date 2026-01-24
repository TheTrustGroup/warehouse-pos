import { Transaction } from '../../types';
import { formatCurrency, formatDateTime } from '../../lib/utils';
import { X, Printer, Mail } from 'lucide-react';

interface ReceiptProps {
  transaction: Transaction;
  onClose: () => void;
}

export function Receipt({ transaction, onClose }: ReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in-up">
      <div className="glass-card rounded-2xl shadow-large max-w-md w-full max-h-[90vh] overflow-y-auto animate-fade-in-up">
        <div className="p-6 border-b border-white/30 flex items-center justify-between print:hidden">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Receipt</h2>
          <button onClick={onClose} className="btn-action hover:bg-slate-100/80">
            <X className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>

        {/* Receipt Content */}
        <div className="p-6" id="receipt-content">
          {/* Store Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold gradient-text">Extreme Dept Kidz</h1>
            <p className="text-sm text-slate-600 font-medium">Your trusted kids fashion store</p>
            <p className="text-xs text-slate-500 mt-1">Accra, Ghana</p>
            <p className="text-xs text-slate-500">Tel: +233 XX XXX XXXX</p>
          </div>

          {/* Transaction Info */}
          <div className="border-t border-b border-dashed border-slate-300 py-3 mb-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Receipt No:</span>
              <span className="font-medium">{transaction.transactionNumber}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-slate-600">Date:</span>
              <span className="font-medium">{formatDateTime(transaction.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Cashier:</span>
              <span className="font-medium">{transaction.cashier}</span>
            </div>
          </div>

          {/* Items */}
          <div className="mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2">Item</th>
                  <th className="text-center py-2">Qty</th>
                  <th className="text-right py-2">Price</th>
                  <th className="text-right py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {transaction.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-2 text-slate-900">{item.productName}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t border-slate-300 pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(transaction.subtotal)}</span>
            </div>
            {transaction.discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount:</span>
                <span className="font-medium">-{formatCurrency(transaction.discount)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-600">VAT (15%):</span>
              <span className="font-medium">{formatCurrency(transaction.tax)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-slate-300">
              <span>TOTAL:</span>
              <span className="text-primary-600">{formatCurrency(transaction.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Payment Method:</span>
              <span className="font-medium capitalize">{transaction.paymentMethod.replace('_', ' ')}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 pt-4 border-t border-slate-300">
            <p className="text-sm text-slate-600">Thank you for shopping with us!</p>
            <p className="text-xs text-slate-500 mt-2">Visit us again soon!</p>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-slate-200 flex gap-3 print:hidden">
          <button
            onClick={handlePrint}
            className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Receipt
          </button>
          <button className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center justify-center gap-2">
            <Mail className="w-5 h-5" />
            Email
          </button>
        </div>
      </div>
    </div>
  );
}
