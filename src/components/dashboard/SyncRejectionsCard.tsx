import { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { fetchSyncRejections, voidSyncRejection, type SyncRejection } from '../../services/syncRejectionsApi';
import { useToast } from '../../contexts/ToastContext';
import { formatRelativeTime } from '../../lib/utils';
import { Button } from '../ui/Button';

export function SyncRejectionsCard() {
  const { showToast } = useToast();
  const [list, setList] = useState<SyncRejection[]>([]);
  const [loading, setLoading] = useState(true);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetchSyncRejections({ voided: false, limit: 50 })
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleVoid = async (id: string) => {
    setVoidingId(id);
    try {
      await voidSyncRejection(id);
      setList((prev) => prev.filter((r) => r.id !== id));
      showToast('success', 'Rejection voided. POS will not retry this sale.');
    } catch {
      showToast('error', 'Failed to void. Try again.');
    } finally {
      setVoidingId(null);
    }
  };

  if (loading && list.length === 0) return null;
  if (list.length === 0) return null;

  return (
    <div className="glass-card p-5 border-amber-200/60 bg-amber-50/50">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-600" strokeWidth={2} aria-hidden />
        <h2 className="text-lg font-semibold text-amber-900">Failed syncs (needs review)</h2>
        <Button
          type="button"
          variant="action"
          onClick={load}
          className="ml-auto p-2 rounded-lg hover:bg-amber-100/80 text-amber-700"
          aria-label="Refresh list"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>
      <p className="text-sm text-amber-800 mb-4">
        These sales could not be applied (e.g. insufficient stock at sync time). Void to stop retries; no inventory change.
      </p>
      <ul className="space-y-2 max-h-60 overflow-y-auto">
        {list.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-lg bg-white/80 border border-amber-200/50"
          >
            <div className="min-w-0">
              <span className="font-mono text-xs text-slate-600 truncate block">{r.idempotencyKey}</span>
              <span className="text-sm text-amber-800">{r.reason}</span>
              {r.posId && <span className="text-xs text-slate-500 ml-2">POS: {r.posId}</span>}
              <span className="text-xs text-slate-500 ml-2">
                {formatRelativeTime(new Date(r.createdAt))}
              </span>
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={() => handleVoid(r.id)}
              disabled={voidingId === r.id}
              className="inline-flex items-center gap-1 text-sm"
              aria-label="Void this rejection"
            >
              <XCircle className="w-4 h-4" />
              Void
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
