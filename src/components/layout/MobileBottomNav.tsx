/**
 * EDK mobile bottom tab bar (5 tabs max). Replaces sidebar on small viewports.
 * Tap targets min 44px; font sizes ≥11px.
 */
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { baseNavigation } from '../../config/navigation';

const MAX_TABS = 5;

export function MobileBottomNav({
  onMoreClick,
}: {
  onMoreClick: () => void;
}) {
  const { hasPermission, hasAnyPermission } = useAuth();

  const navigation = baseNavigation.filter(
    (item) =>
      (item.permission == null && 'to' in item) ||
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  const showMore = navigation.length > MAX_TABS;
  const tabs = showMore ? navigation.slice(0, MAX_TABS - 1) : navigation.slice(0, MAX_TABS);

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-[var(--edk-border)] bg-[var(--edk-surface)]"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        paddingTop: 8,
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      {tabs.map((item) => (
        <NavLink
          key={item.name}
          to={item.to}
          className={({ isActive }) =>
            `flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors touch-manipulation ${
              isActive
                ? 'bg-[rgba(232,40,26,0.12)] text-[var(--edk-red)]'
                : 'text-[var(--edk-ink-2)]'
            }`
          }
          role="tab"
        >
          <item.icon className="w-6 h-6 flex-shrink-0" strokeWidth={2} aria-hidden />
          <span className="text-[11px] font-medium leading-tight">{item.name}</span>
        </NavLink>
      ))}
      {showMore && (
        <button
          type="button"
          onClick={onMoreClick}
          className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg text-[var(--edk-ink-2)] transition-colors touch-manipulation"
          role="tab"
          aria-label="More menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
          <span className="text-[11px] font-medium leading-tight">More</span>
        </button>
      )}
    </nav>
  );
}
