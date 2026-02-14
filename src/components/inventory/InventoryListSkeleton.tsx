/**
 * Stable skeleton for inventory list. Matches table row and grid card height
 * to prevent container collapse or layout shift during fetch.
 */

interface InventoryListSkeletonProps {
  viewMode: 'table' | 'grid';
  /** Number of skeleton rows/cards (default 8). */
  count?: number;
}

const TABLE_ROW_MIN_HEIGHT = 72;
const GRID_CARD_MIN_HEIGHT = 380;

export function InventoryListSkeleton({ viewMode, count = 8 }: InventoryListSkeletonProps) {
  if (viewMode === 'table') {
    return (
      <div className="table-container" role="status" aria-live="polite">
        <div className="table-scroll-wrap -mx-1">
          <table className="w-full min-w-[800px]">
            <thead className="table-header sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-10" />
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Image</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Stock</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: count }).map((_, i) => (
                <tr key={i} className="table-row" style={{ minHeight: TABLE_ROW_MIN_HEIGHT }}>
                  <td className="px-4 py-3 align-middle"><div className="skeleton w-4 h-4 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton w-14 h-14 rounded-lg" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-32 rounded mb-1" /><div className="skeleton h-3 w-24 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-20 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-5 w-16 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-12 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-16 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-24 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-4 w-20 rounded" /></td>
                  <td className="px-4 py-3 align-middle"><div className="skeleton h-8 w-20 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="sr-only">Loading inventory…</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" role="status" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="solid-card overflow-hidden flex flex-col"
          style={{ minHeight: GRID_CARD_MIN_HEIGHT }}
        >
          <div className="skeleton w-full h-48 rounded-lg mb-4" />
          <div className="space-y-3 flex-1">
            <div className="skeleton h-5 w-3/4 rounded" />
            <div className="skeleton h-3 w-full rounded" />
            <div className="skeleton h-10 w-full rounded-lg" />
            <div className="flex justify-between pt-2">
              <div className="skeleton h-8 w-24 rounded" />
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
            <div className="flex gap-2 pt-3 border-t border-slate-200/50">
              <div className="skeleton h-10 flex-1 rounded-xl" />
              <div className="skeleton h-10 w-12 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading inventory…</span>
    </div>
  );
}
