/**
 * Double-E monochrome logo. Shared by Sidebar (light) and Login lockup (dark).
 * Light variant: dark E's on light bg. Dark variant: light E's on dark bg.
 */
export function DoubleELogo({
  size = 40,
  variant = 'light',
  className = '',
}: {
  size?: number;
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const isLight = variant === 'light';
  const bg = isLight ? 'transparent' : '#1A1917';
  const stroke = isLight ? 'rgba(226, 232, 240, 0.9)' : 'rgba(255,255,255,0.09)';
  const spine = isLight ? '#64748b' : 'rgba(255,255,255,0.32)';
  const bar = isLight ? '#334155' : '#F0EDE8';
  const seam = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255,255,255,0.18)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect x="0" y="0" width="80" height="80" rx="12" fill={bg} />
      <rect
        x="0"
        y="0"
        width="80"
        height="80"
        rx="12"
        fill="none"
        stroke={stroke}
        strokeWidth="1"
      />
      {/* Left E — spine + bars */}
      <rect x="11" y="22" width="6" height="36" rx="1.5" fill={spine} />
      <rect x="11" y="22" width="24" height="7" rx="1.5" fill={bar} />
      <rect x="11" y="36.5" width="19" height="7" rx="1.5" fill={bar} />
      <rect x="11" y="51" width="24" height="7" rx="1.5" fill={bar} />
      {/* Right E — spine + bars */}
      <rect x="63" y="22" width="6" height="36" rx="1.5" fill={spine} />
      <rect x="45" y="22" width="24" height="7" rx="1.5" fill={bar} />
      <rect x="50" y="36.5" width="19" height="7" rx="1.5" fill={bar} />
      <rect x="45" y="51" width="24" height="7" rx="1.5" fill={bar} />
      <rect x="39" y="22" width="2" height="36" rx="1" fill={seam} />
    </svg>
  );
}
