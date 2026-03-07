const sizePx = { sm: 16, md: 32, lg: 48 };

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const px = sizePx[size];

  return (
    <div className="flex items-center justify-center" aria-hidden>
      <div
        className="rounded-full animate-spin"
        style={{
          width: px,
          height: px,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: 'var(--edk-border-mid)',
          borderTopColor: 'var(--edk-red)',
        }}
      />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--edk-bg)]">
      <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-8 text-center shadow-sm">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm font-medium text-[var(--edk-ink-2)]">Loading...</p>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="relative min-h-[8.5rem] overflow-hidden rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-6">
      <div className="h-4 w-1/4 rounded bg-[var(--edk-border-mid)] mb-4 animate-pulse" />
      <div className="h-8 w-1/2 rounded bg-[var(--edk-border-mid)] mb-2 animate-pulse" />
      <div className="h-3 w-3/4 rounded bg-[var(--edk-border-mid)] animate-pulse" />
    </div>
  );
}
