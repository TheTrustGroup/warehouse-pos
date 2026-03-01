import { DoubleELogo } from '../ui/DoubleELogo';

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
      <DoubleELogo size={iconSize} variant="dark" className="flex-shrink-0" />

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
