/**
 * Phase 3 design system: size + quantity pill. Color from quantity only:
 * 0 → red, ≤2 → amber, >2 → green (no stored stock_status).
 */
export interface SizePillProps {
  size: string;
  quantity: number;
  className?: string;
}

function quantityColor(quantity: number): string {
  if (quantity === 0) return 'text-[var(--edk-red)]';
  if (quantity <= 2) return 'text-[var(--edk-amber)]';
  return 'text-[var(--edk-green)]';
}

export function SizePill({ size, quantity, className = '' }: SizePillProps) {
  const colorClass = quantityColor(quantity);
  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-[var(--edk-radius-sm)]
        border border-[var(--edk-border-mid)] bg-[var(--edk-surface)]
        px-2 py-1 text-xs font-medium
        ${className}
      `.trim()}
      aria-label={`Size ${size}: ${quantity} in stock`}
    >
      <span className="text-[var(--edk-ink-2)]">{size}</span>
      <span
        className={`font-mono tabular-nums ${colorClass}`}
        style={{ fontFamily: "'IBM Plex Mono', 'SF Mono', Consolas, monospace" }}
      >
        {quantity}
      </span>
    </span>
  );
}
