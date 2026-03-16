/**
 * Compact "More" menu: bottom sheet with overflow nav links, warehouse switcher,
 * role switcher, and logout. Replaces opening the full sidebar from the bottom nav.
 */
import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MapPin, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWarehouse } from '../../contexts/WarehouseContext';
import { ROLES } from '../../types/permissions';
import { baseNavigation } from '../../config/navigation';

const MAX_TABS = 5;

function getRoleDisplayName(roleId: string | undefined): string {
  if (roleId == null || roleId === '') return '—';
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase().replace(/\s+/g, '_');
  return ROLES[key]?.name ?? roleId;
}

interface MoreMenuSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MoreMenuSheet({ open, onClose }: MoreMenuSheetProps) {
  const navigate = useNavigate();
  const { user, hasPermission, hasAnyPermission, switchRole, logout } = useAuth();
  const {
    warehouses,
    currentWarehouseId,
    setCurrentWarehouseId,
    currentWarehouse,
    isWarehouseBoundToSession,
    isLoading: warehousesLoading,
  } = useWarehouse();

  const canSeeSwitchRole = user?.role === 'admin' || user?.role === 'super_admin';
  const showWarehouseSwitcher = !warehousesLoading && warehouses.length > 0;
  const canSwitchWarehouse = showWarehouseSwitcher && warehouses.length > 1 && !isWarehouseBoundToSession;

  const navigation = baseNavigation.filter(
    (item) =>
      (item.permission == null && 'to' in item) ||
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );
  const overflowItems = navigation.length > MAX_TABS ? navigation.slice(MAX_TABS - 1) : [];

  useEffect(() => {
    if (open) document.body.classList.add('scroll-lock');
    else document.body.classList.remove('scroll-lock');
    return () => document.body.classList.remove('scroll-lock');
  }, [open]);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login', { replace: true });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More menu">
      <div
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 right-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-[var(--edk-surface)] shadow-xl border-t border-[var(--edk-border)]"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <div className="sticky top-0 z-10 pt-2 pb-1 flex flex-col items-center border-b border-[var(--edk-border)] bg-[var(--edk-surface)]">
          <span className="w-10 h-1 rounded-full bg-[var(--edk-border-mid)] shrink-0 mb-2" aria-hidden />
          <div className="flex items-center justify-between w-full px-4 py-2">
          <h2 className="text-[14px] font-extrabold uppercase tracking-wide text-[var(--edk-ink)]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            More
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--edk-ink-3)] hover:bg-[var(--edk-bg)]"
            aria-label="Close menu"
          >
            ✕
          </button>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          {overflowItems.length > 0 && (
            <nav className="space-y-0.5" aria-label="More pages">
              {overflowItems.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-colors touch-manipulation min-h-[48px] ${
                      isActive
                        ? 'bg-[var(--blue-soft)] text-[var(--blue)]'
                        : 'text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)]'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
                  {item.name}
                </NavLink>
              ))}
            </nav>
          )}

          {showWarehouseSwitcher && (
            <div className="pt-2 border-t border-[var(--edk-border)]">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-[var(--edk-ink-3)]" aria-hidden />
                <span className="text-[11px] font-semibold text-[var(--edk-ink-3)] uppercase tracking-wide">Warehouse</span>
              </div>
              {canSwitchWarehouse ? (
                <label className="block">
                  <span className="sr-only">Select warehouse</span>
                  <select
                    value={currentWarehouseId}
                    onChange={(e) => {
                      setCurrentWarehouseId(e.target.value);
                      onClose();
                    }}
                    className="w-full h-[44px] pl-3 pr-8 rounded-xl bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[13px] font-medium text-[var(--edk-ink)]"
                    aria-label="Select warehouse"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-[13px] font-medium text-[var(--edk-ink-2)] truncate" title={currentWarehouse?.name ?? ''}>
                  {currentWarehouse?.name ?? '—'}
                </p>
              )}
            </div>
          )}

          {user && (
            <div className="pt-2 border-t border-[var(--edk-border)] space-y-2">
              <p className="text-[11px] text-[var(--edk-ink-3)]">
                <span className="font-medium text-[var(--edk-ink-2)]">Role: </span>
                {getRoleDisplayName(user.role)}
              </p>
              {canSeeSwitchRole && (
                <label className="block">
                  <span className="text-[11px] font-medium text-[var(--edk-ink-3)] block mb-1">Switch role (testing)</span>
                  <select
                    value={user.role}
                    onChange={(e) => {
                      switchRole(e.target.value);
                      onClose();
                    }}
                    className="w-full h-[44px] pl-3 pr-8 rounded-xl bg-[var(--edk-bg)] border border-[var(--edk-border-mid)] text-[13px] font-medium text-[var(--edk-ink)]"
                    aria-label="Switch role"
                  >
                    {Object.values(ROLES).map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-[var(--edk-border)]">
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-[13px] font-medium text-[var(--edk-ink-2)] hover:bg-[var(--edk-bg)] min-h-[48px] touch-manipulation"
            >
              <LogOut className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
