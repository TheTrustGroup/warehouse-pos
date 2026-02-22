export interface CompletedSale {
  receiptId?: string;
  saleId?: string;
  completedAt?: string;
  warehouseId?: string;
  subtotal?: number;
  total: number;
  paymentMethod: string;
  customerName?: string | null;
  discountPct?: number;
  discountAmt?: number;
  lines: Array<{
    name: string;
    sizeLabel?: string | null;
    qty: number;
    unitPrice: number;
  }>;
}

interface SaleSuccessScreenProps {
  sale: CompletedSale | null;
  onNewSale: () => void;
  onPrint: (sale: CompletedSale) => void;
  onShareReceipt: (sale: CompletedSale) => void;
}

export default function SaleSuccessScreen({
  sale,
  onNewSale,
  onPrint,
  onShareReceipt,
}: SaleSuccessScreenProps) {
  if (!sale) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl">
          ✓
        </div>
        <h2 className="text-xl font-bold text-slate-900">Sale complete</h2>
        {sale.receiptId && (
          <p className="mt-1 text-sm text-slate-500">{sale.receiptId}</p>
        )}
        <p className="mt-2 text-2xl font-bold text-primary-600">
          GH₵{Number(sale.total).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={onNewSale}
            className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white"
          >
            New sale
          </button>
          <button
            type="button"
            onClick={() => onPrint(sale)}
            className="w-full rounded-xl border border-slate-200 py-3 font-medium text-slate-700"
          >
            Print receipt
          </button>
          <button
            type="button"
            onClick={() => onShareReceipt(sale)}
            className="w-full rounded-xl border border-slate-200 py-3 font-medium text-slate-700"
          >
            Share receipt
          </button>
        </div>
      </div>
    </div>
  );
}
