/**
 * Phase 4: Mobile drawer matches desktop Sidebar — same --edk-sidebar-bg, brand block, nav and warehouse styling.
 */
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWarehouse } from '../../contexts/WarehouseContext';
import { ROLES } from '../../types/permissions';
import { baseNavigation } from '../../config/navigation';
import { Button } from '../ui/Button';
import { DoubleELogo } from '../ui/DoubleELogo';

function getRoleDisplayName(roleId: string | undefined): string {
  if (roleId == null || roleId === '') return '—';
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase().replace(/\s+/g, '_');
  return ROLES[key]?.name ?? roleId;
}

interface MobileMenuProps {
  /** When set, menu is controlled from outside (e.g. "More" in bottom nav). Hamburger is hidden. */
  open?: boolean;
  onClose?: () => void;
}

export function MobileMenu({ open: controlledOpen, onClose }: MobileMenuProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const { user, hasPermission, hasAnyPermission, switchRole } = useAuth();
  const { warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse, isWarehouseBoundToSession, isLoading: warehousesLoading } = useWarehouse();
  const canSeeSwitchRole = user?.role === 'admin' || user?.role === 'super_admin';

  const showWarehouseSwitcher = !warehousesLoading && warehouses.length > 0;
  const canSwitchWarehouse = showWarehouseSwitcher && warehouses.length > 1 && !isWarehouseBoundToSession;

  const navigation = baseNavigation.filter(
    (item) =>
      (item.permission == null && 'to' in item) ||
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  const mainNav = navigation.filter((item) => item.to !== '/users' && item.to !== '/settings');
  const footerNav = navigation.filter((item) => item.to === '/users' || item.to === '/settings');

  useEffect(() => {
    if (isOpen) document.body.classList.add('scroll-lock');
    else document.body.classList.remove('scroll-lock');
    return () => document.body.classList.remove('scroll-lock');
  }, [isOpen]);

  const handleClose = () => {
    if (isControlled && onClose) onClose();
    else setInternalOpen(false);
  };

  return (
    <>
      {!isControlled && (
        <Button
          variant="action"
          onClick={() => setInternalOpen(!isOpen)}
          className="lg:hidden fixed top-[calc(var(--edk-topbar-h)+var(--safe-top)+8px)] left-4 z-40 min-h-[44px] min-w-[44px] flex items-center justify-center bg-[var(--edk-surface)] border border-[var(--edk-border-mid)] rounded-xl shadow-md text-[var(--edk-ink-2)]"
          aria-label="Toggle menu"
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="w-6 h-6" strokeWidth={2} /> : <Menu className="w-6 h-6" strokeWidth={2} />}
        </Button>
      )}

      <div
        className={`fixed inset-0 z-40 lg:hidden transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={handleClose}
          aria-hidden
        />
        <aside
          className="relative w-[var(--edk-sidebar-w)] min-w-[var(--edk-sidebar-w)] max-w-[85vw] h-full min-h-[var(--h-viewport)] flex flex-col flex-shrink-0 overflow-y-auto overflow-x-hidden shadow-xl"
          style={{ background: 'var(--edk-sidebar-bg)', fontFamily: "'DM Sans', system-ui, sans-serif" }}
        >
          {/* Logo: same as Sidebar */}
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/[0.06] flex-shrink-0">
            <div className="w-[34px] h-[34px] rounded-lg bg-[#1A1917] border border-white/[0.09] flex items-center justify-center overflow-hidden flex-shrink-0">
              <DoubleELogo size={34} variant="dark" />
            </div>
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-[13px] font-extrabold tracking-[0.1em] text-[#F0EDE8] uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Extreme Dept
              </span>
              <span className="text-[10px] font-semibold tracking-wide text-white/[0.38] uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                Kidz · Inventory & POS
              </span>
            </div>
          </div>

          {showWarehouseSwitcher && (
            <div className="px-3 pt-3 pb-1 flex-shrink-0">
              <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/[0.22] mb-1.5 pl-0.5">Warehouse</div>
              {canSwitchWarehouse ? (
                <label className="block">
                  <span className="sr-only">Select warehouse</span>
                  <select
                    value={currentWarehouseId}
                    onChange={(e) => { setCurrentWarehouseId(e.target.value); handleClose(); }}
                    className="w-full h-9 pl-2.5 pr-7 text-xs font-medium text-white/80 rounded-[var(--edk-radius-sm)] cursor-pointer appearance-none border border-white/[0.07] bg-white/[0.04] focus:outline-none focus:ring-1 focus:ring-white/20"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                    aria-label="Select warehouse"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-[var(--edk-radius-sm)] bg-white/[0.04] border border-white/[0.07]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--edk-green)] flex-shrink-0" aria-hidden />
                  <span className="text-xs font-medium text-white/80 truncate">{currentWarehouse?.name ?? '—'}</span>
                  <ChevronDown className="w-3 h-3 text-white/30 flex-shrink-0" aria-hidden />
                </div>
              )}
            </div>
          )}

          <nav className="flex-1 min-h-0 py-2 flex flex-col overflow-y-auto">
            <div className="py-2">
              {mainNav.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  onClick={handleClose}
                  className={({ isActive }) =>
                    `sidebar-nav-link flex items-center gap-2 py-2 px-3.5 mx-2 rounded-[var(--edk-radius-sm)] text-[13px] transition-colors duration-150 ${
                      isActive
                        ? 'is-active bg-[rgba(232,40,26,0.12)] text-white font-medium'
                        : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
                    }`
                  }
                >
                  <item.icon className="sidebar-nav-icon w-4 h-4 flex-shrink-0" strokeWidth={2} />
                  <span>{item.name}</span>
                </NavLink>
              ))}
            </div>
            {footerNav.length > 0 && (
              <>
                <div className="h-px bg-white/[0.06] mx-3 my-2" aria-hidden />
                <div className="py-2">
                  {footerNav.map((item) => (
                    <NavLink
                      key={item.name}
                      to={item.to}
                      onClick={handleClose}
                      className={({ isActive }) =>
                        `sidebar-nav-link flex items-center gap-2 py-2 px-3.5 mx-2 rounded-[var(--edk-radius-sm)] text-[13px] transition-colors duration-150 ${
                          isActive
                            ? 'is-active bg-[rgba(232,40,26,0.12)] text-white font-medium'
                            : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
                        }`
                      }
                    >
                      <item.icon className="sidebar-nav-icon w-4 h-4 flex-shrink-0" strokeWidth={2} />
                      <span>{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              </>
            )}
          </nav>

          <div className="p-3 border-t border-white/[0.06] flex-shrink-0 mt-auto">
            <div className="flex items-center gap-2 p-2 rounded-[var(--edk-radius-sm)] hover:bg-white/[0.04] transition-colors cursor-default">
              <div
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ background: user?.role === 'cashier' ? 'var(--edk-ink-2)' : 'var(--edk-red)' }}
              >
                {user?.fullName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-white/75 truncate">
                  {user?.email?.replace(/@.*/, '') ?? user?.fullName ?? '—'}
                </p>
                {canSeeSwitchRole && user ? (
                  <label className="block mt-0.5">
                    <span className="sr-only">Switch role</span>
                    <select
                      value={user.role}
                      onChange={(e) => { switchRole(e.target.value); handleClose(); }}
                      className="w-full text-[10px] font-medium text-white/30 bg-transparent border-0 p-0 cursor-pointer focus:outline-none focus:ring-0"
                      aria-label="Switch role"
                    >
                      {Object.values(ROLES).map((role) => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="text-[10px] text-white/30">{getRoleDisplayName(user?.role)}</p>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
