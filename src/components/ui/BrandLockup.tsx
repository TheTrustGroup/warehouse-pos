/**
 * World-class brand lockup: logo + Extreme Dept Kidz + Inventory & POS.
 * Single source of truth for alignment, typography, and spacing.
 */
import { DoubleELogo } from './DoubleELogo';

const LOCKUP = {
  sidebar: {
    logoSize: 40,
    logoGap: 10,
    wordmarkSize: 17,
    taglineSize: 11,
    taglineIndent: 50, // logoSize + logoGap
  },
  login: {
    logoSize: 52,
    logoGap: 14,
    wordmarkSize: 20,
    taglineSize: 12,
    taglineIndent: 66, // logoSize + logoGap
  },
} as const;

export function BrandLockup({
  variant = 'sidebar',
  className = '',
}: {
  variant?: 'sidebar' | 'login';
  className?: string;
}) {
  const isLogin = variant === 'login';
  const t = LOCKUP[variant];

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        className="flex items-center"
        style={{ gap: t.logoGap }}
      >
        <DoubleELogo
          size={t.logoSize}
          variant={isLogin ? 'dark' : 'light'}
          className="flex-shrink-0"
        />
        <span
          className="gradient-text font-bold leading-none tracking-tight uppercase whitespace-nowrap"
          style={{
            fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif",
            fontSize: t.wordmarkSize,
            letterSpacing: '0.04em',
          }}
        >
          Extreme Dept Kidz
        </span>
      </div>
      <p
        className={`font-medium tracking-wide ${!isLogin ? 'text-slate-500' : ''}`}
        style={{
          fontSize: t.taglineSize,
          paddingLeft: t.taglineIndent,
          lineHeight: 1.4,
          ...(isLogin && { color: 'rgba(240,237,232,0.65)' }),
        }}
      >
        Inventory & POS
      </p>
    </div>
  );
}
