const sizePx: Record<'sm' | 'md' | 'lg' | 'xl', number> = { sm: 16, md: 32, lg: 48, xl: 40 };

/** Single loading spinner used app-wide: red ring (--edk-border + --edk-red), edk-spin. Matches "Loading warehouse" style. */
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const px = sizePx[size];

  return (
    <div className="flex items-center justify-center shrink-0" aria-hidden>
      <div
        className="rounded-full"
        style={{
          width: px,
          height: px,
          borderWidth: 3,
          borderStyle: 'solid',
          borderColor: 'var(--edk-border)',
          borderTopColor: 'var(--edk-red)',
          animation: 'edk-spin 0.8s linear infinite',
        }}
      />
    </div>
  );
}

/** Full-page loading screen matching "Loading warehouse" style: edk-bg, 40px red ring, Barlow Condensed uppercase label. */
export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <div
      className="min-h-[var(--min-h-viewport)] flex flex-col items-center justify-center bg-[var(--edk-bg)] gap-4"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="xl" />
      <p
        className="uppercase font-bold text-[14px] tracking-[0.08em] m-0"
        style={{
          fontFamily: "'Barlow Condensed', sans-serif",
          color: 'var(--edk-ink-3)',
        }}
      >
        {message}
      </p>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--edk-bg)]">
      <div className="rounded-[var(--edk-radius)] border border-[var(--edk-border)] bg-[var(--edk-surface)] p-8 text-center shadow-sm">
        <LoadingSpinner size="xl" />
        <p
          className="mt-4 uppercase font-bold text-[14px] tracking-[0.08em]"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            color: 'var(--edk-ink-3)',
          }}
        >
          Loading...
        </p>
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
