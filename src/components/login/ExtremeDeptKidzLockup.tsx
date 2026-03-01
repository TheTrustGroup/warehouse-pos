/**
 * EXTREME DEPT KIDZ — Monochrome lockup for login left panel.
 * Icon 80×80 (double E) + wordmark. Barlow Condensed 800.
 * "EXTREME" full; "DEPT" dimmed; "KIDZ" full.
 */
export function ExtremeDeptKidzLockup({
  iconSize = 80,
  showWordmark = true,
  wordmarkSize = 28,
  letterSpacing = 3.5,
  className = '',
}: {
  iconSize?: number;
  showWordmark?: boolean;
  wordmarkSize?: number;
  letterSpacing?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 ${className}`}
      style={{ fontFamily: "'Barlow Condensed', 'Arial Narrow', 'Impact', sans-serif" }}
      aria-label="Extreme Dept Kidz"
    >
      {/* 80×80 double-E icon — matches spec exactly */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 80 80"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        aria-hidden
      >
        <rect x="0" y="0" width="80" height="80" rx="12" fill="#1A1917" />
        <rect
          x="0"
          y="0"
          width="80"
          height="80"
          rx="12"
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="1"
        />
        {/* Left E — spine + bars (y 22→58 in 80×80 = spec 32→68 in 100-tall) */}
        <rect x="11" y="22" width="6" height="36" rx="1.5" fill="rgba(255,255,255,0.32)" />
        <rect x="11" y="22" width="24" height="7" rx="1.5" fill="#F0EDE8" />
        <rect x="11" y="36.5" width="19" height="7" rx="1.5" fill="#F0EDE8" />
        <rect x="11" y="51" width="24" height="7" rx="1.5" fill="#F0EDE8" />
        {/* Right E — spine + bars */}
        <rect x="63" y="22" width="6" height="36" rx="1.5" fill="rgba(255,255,255,0.32)" />
        <rect x="45" y="22" width="24" height="7" rx="1.5" fill="#F0EDE8" />
        <rect x="50" y="36.5" width="19" height="7" rx="1.5" fill="#F0EDE8" />
        <rect x="45" y="51" width="24" height="7" rx="1.5" fill="#F0EDE8" />
        {/* Center seam */}
        <rect x="39" y="22" width="2" height="36" rx="1" fill="white" opacity="0.18" />
      </svg>

      {showWordmark && (
        <>
          <div
            className="w-px flex-shrink-0 self-stretch"
            style={{ background: 'rgba(255,255,255,0.1)', minHeight: 48 }}
            aria-hidden
          />
          <div className="flex flex-col justify-center gap-0.5">
            <span
              className="font-extrabold leading-none tracking-wide"
              style={{
                fontSize: wordmarkSize,
                letterSpacing,
                color: '#F0EDE8',
              }}
            >
              EXTREME
            </span>
            <span
              className="font-extrabold leading-none tracking-wide"
              style={{
                fontSize: wordmarkSize,
                letterSpacing,
              }}
            >
              <span style={{ color: 'rgba(240,237,232,0.38)' }}>DEPT </span>
              <span style={{ color: '#F0EDE8' }}>KIDZ</span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
