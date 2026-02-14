export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex items-center justify-center">
      <div className={`${sizeClasses[size]} border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin`}></div>
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50">
      <div className="glass-primary rounded-2xl p-8 text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-slate-600 dark:text-slate-300 font-medium">Loading...</p>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="glass-card rounded-2xl p-6 overflow-hidden relative">
      <div className="absolute inset-0 glass-shimmer pointer-events-none" aria-hidden />
      <div className="h-4 bg-slate-200/80 dark:bg-slate-600/50 rounded w-1/4 mb-4 animate-pulse"></div>
      <div className="h-8 bg-slate-200/80 dark:bg-slate-600/50 rounded w-1/2 mb-2 animate-pulse"></div>
      <div className="h-3 bg-slate-200/80 dark:bg-slate-600/50 rounded w-3/4 animate-pulse"></div>
    </div>
  );
}
