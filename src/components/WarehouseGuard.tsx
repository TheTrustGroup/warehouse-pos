/**
 * Phase 2: Guard that shows loading or error state when warehouse is not ready.
 * Wrap authenticated routes (Dashboard, Inventory, POS, Sales, etc.) so users
 * never see data with a wrong or missing warehouse ID.
 *
 * Uses current brand: Barlow Condensed, --edk-* colors, primary red #E8281A.
 */
import { useCurrentWarehouse, useWarehouse } from '../contexts/WarehouseContext';

export function WarehouseGuard({ children }: { children: React.ReactNode }) {
  const { warehouseId: id, isLoading, error } = useCurrentWarehouse();
  const { refreshWarehouses } = useWarehouse();

  const handleRetry = () => {
    refreshWarehouses().catch(() => {});
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen w-full flex-col gap-4"
        style={{
          background: 'var(--edk-bg, #0A0A0A)',
        }}
      >
        <div
          className="rounded-full border-[3px] border-[var(--edk-border)] border-t-[var(--edk-red)]"
          style={{
            width: 40,
            height: 40,
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p
          className="uppercase tracking-wider text-[var(--edk-ink-3)]"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.08em',
            color: 'var(--edk-ink-3, #52525B)',
          }}
        >
          Loading warehouse...
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!id || error) {
    return (
      <div
        className="flex items-center justify-center min-h-screen w-full flex-col gap-3"
        style={{
          background: 'var(--edk-bg, #0A0A0A)',
        }}
      >
        <p
          className="text-center"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: 18,
            color: 'var(--edk-ink, #FFFFFF)',
          }}
        >
          Could not load warehouse
        </p>
        <p
          className="text-center text-[13px]"
          style={{
            fontFamily: "'Inter', sans-serif",
            color: 'var(--edk-ink-3, #52525B)',
          }}
        >
          {error ?? 'Contact your administrator.'}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-2 min-h-[44px] px-5 rounded-lg border-0 cursor-pointer uppercase tracking-wide font-bold text-[14px] text-white"
          style={{
            background: 'var(--edk-red, #E8281A)',
            fontFamily: "'Barlow Condensed', sans-serif",
            letterSpacing: '0.06em',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
