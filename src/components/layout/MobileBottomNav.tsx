/**
 * Mobile bottom navigation — Hunnid Official mobile FAB layout.
 * Replaces sidebar on small viewports; desktop unchanged.
 */
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { baseNavigation } from '../../config/navigation';
import type { LucideIcon } from 'lucide-react';

const MAX_TABS = 5;

type NavItem = (typeof baseNavigation)[number] & { to: string };

function NavTab({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <button type="button" className="flex flex-1 flex-col items-center gap-0.5">
      <Icon size={20} className={active ? 'text-[#1B6FE8]' : 'text-[#9B9890]'} />
      <span
        className={`text-[9px] font-medium ${
          active ? 'text-[#1B6FE8]' : 'text-[#9B9890]'
        }`}
      >
        {label}
      </span>
    </button>
  );
}

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
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions)),
  ) as NavItem[];

  const showMore = navigation.length > MAX_TABS;

  const dashboard = navigation.find((n) => n.to === '/');
  const inventory = navigation.find((n) => n.to === '/inventory');
  const sales = navigation.find((n) => n.to === '/sales');

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] h-16 bg-white border-t border-[#E0DED8] flex items-center justify-around px-2 pb-2"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        fontFamily: "'DM Sans', system-ui, sans-serif",
      }}
      role="tablist"
      aria-label="Main navigation"
    >
      {dashboard && (
        <NavLink to={dashboard.to} className="flex-1" role="tab">
          {({ isActive }) => (
            <NavTab icon={dashboard.icon} label="Dashboard" active={isActive} />
          )}
        </NavLink>
      )}

      {inventory && (
        <NavLink to={inventory.to} className="flex-1" role="tab">
          {({ isActive }) => (
            <NavTab icon={inventory.icon} label="Inventory" active={isActive} />
          )}
        </NavLink>
      )}

      {/* POS: elevated FAB in center */}
      <NavLink
        to="/pos"
        role="tab"
        aria-label="POS"
        className="flex flex-col items-center gap-0.5 -mt-3.5"
      >
        <div className="w-12 h-12 bg-[#1A1916] rounded-[14px] flex items-center justify-center shadow-[0_3px_10px_rgba(0,0,0,0.3)]">
          {(() => {
            const PosIcon = navigation.find((n) => n.to === '/pos')?.icon ?? navigation[0]?.icon;
            return PosIcon ? <PosIcon size={22} className="text-white" /> : null;
          })()}
        </div>
        <span className="text-[9px] font-medium text-[#1B6FE8]">
          POS
        </span>
      </NavLink>

      {sales && (
        <NavLink to={sales.to} className="flex-1" role="tab">
          {({ isActive }) => (
            <NavTab icon={sales.icon} label="Sales" active={isActive} />
          )}
        </NavLink>
      )}

      {showMore && (
        <button
          type="button"
          onClick={onMoreClick}
          className="flex flex-1 flex-col items-center gap-0.5"
          role="tab"
          aria-label="More menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="text-[#9B9890]"
            aria-hidden
          >
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
          <span className="text-[9px] font-medium text-[#9B9890]">
            More
          </span>
        </button>
      )}
    </nav>
  );
}
