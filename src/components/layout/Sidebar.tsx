// src/components/layout/Sidebar.tsx - Premium Figma-Inspired Design
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  MapPin,
  Receipt,
  Truck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWarehouse } from '../../contexts/WarehouseContext';
import { PERMISSIONS, ROLES, type Permission } from '../../types/permissions';
import { BrandLockup } from '../ui/BrandLockup';

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
  anyPermissions?: Permission[];
}

const baseNavigation: NavItem[] = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD.VIEW },
  { name: 'Inventory', to: '/inventory', icon: Package, permission: PERMISSIONS.INVENTORY.VIEW },
  { name: 'Orders', to: '/orders', icon: ClipboardList, permission: PERMISSIONS.ORDERS.VIEW },
  { name: 'POS', to: '/pos', icon: ShoppingCart, permission: PERMISSIONS.POS.ACCESS },
  { name: 'Sales', to: '/sales', icon: Receipt, permission: PERMISSIONS.REPORTS.VIEW_SALES },
  { name: 'Deliveries', to: '/deliveries', icon: Truck, permission: PERMISSIONS.DELIVERIES.VIEW },
  {
    name: 'Reports',
    to: '/reports',
    icon: BarChart3,
    anyPermissions: [
      PERMISSIONS.REPORTS.VIEW_SALES,
      PERMISSIONS.REPORTS.VIEW_INVENTORY,
      PERMISSIONS.REPORTS.VIEW_PROFIT,
    ],
  },
  { name: 'Users', to: '/users', icon: Users, permission: PERMISSIONS.USERS.VIEW },
  { name: 'Settings', to: '/settings', icon: Settings, permission: PERMISSIONS.SETTINGS.VIEW },
];

function getRoleDisplayName(roleId: string | undefined): string {
  if (roleId == null || roleId === '') return '—';
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase().replace(/\s+/g, '_');
  return ROLES[key]?.name ?? roleId;
}

export function Sidebar() {
  const { user, hasPermission, hasAnyPermission, switchRole } = useAuth();
  const { warehouses, currentWarehouseId, setCurrentWarehouseId, currentWarehouse, isWarehouseBoundToSession, isLoading: warehousesLoading } = useWarehouse();
  // Hardening: only admins see "Switch role" (testing). Others cannot try to switch; backend enforces 403.
  const canSeeSwitchRole = user?.role === 'admin' || user?.role === 'super_admin';

  const showWarehouseSwitcher = !warehousesLoading && warehouses.length > 0;
  const canSwitchWarehouse = showWarehouseSwitcher && warehouses.length > 1 && !isWarehouseBoundToSession;

  const navigation = baseNavigation.filter(
    (item) =>
      (item.permission == null && 'to' in item) ||
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  return (
    <aside className="fixed left-0 top-0 w-[280px] min-w-[280px] h-[var(--h-viewport)] max-h-[var(--h-viewport)] solid-panel border-r border-slate-200/80 flex flex-col shadow-lg flex-shrink-0">
      {/* Brand lockup: logo, name, tagline — refined alignment & typography */}
      <div className="px-5 py-4 border-b border-slate-200/30 flex-shrink-0">
        <BrandLockup variant="sidebar" />
      </div>

      {/* Warehouse switcher: global scope for Dashboard + Inventory. Hidden when user is bound to one warehouse (e.g. POS cashier). */}
      {showWarehouseSwitcher && (
        <div className="px-3 py-2 border-b border-slate-200/30 flex-shrink-0">
          <div className="flex items-center gap-2 mb-1.5">
            <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" aria-hidden />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Warehouse</span>
          </div>
          {canSwitchWarehouse ? (
            <label className="block">
              <span className="sr-only">Select warehouse (dashboard and inventory use this)</span>
              <select
                value={currentWarehouseId}
                onChange={(e) => setCurrentWarehouseId(e.target.value)}
                className="input-field w-full text-sm font-medium text-slate-800 py-2 pr-8"
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
            <p className="text-sm font-medium text-slate-700 truncate" title={currentWarehouse?.name ?? ''}>
              {currentWarehouse?.name ?? '—'}
            </p>
          )}
        </div>
      )}

      {/* Nav: vertical rhythm space-y-1, touch targets via .nav-item; fixed item height to avoid resize on role change */}
      <nav className="flex-1 min-h-0 py-5 px-2 space-y-1 overflow-y-auto">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" strokeWidth={2} />
            <span className="text-sm">{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-200/30 space-y-3 flex-shrink-0 min-h-[5.5rem]">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors min-h-[3.5rem]">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user?.fullName}
            </p>
            {canSeeSwitchRole && user ? (
              <label className="block mt-0.5">
                <span className="sr-only">Switch role (for testing)</span>
                <select
                  value={user.role}
                  onChange={(e) => switchRole(e.target.value)}
                  className="input-field w-full text-xs font-medium text-slate-600 py-1 pr-6"
                  aria-label="Switch role to see different features"
                >
                  {Object.values(ROLES).map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs text-slate-600 font-medium">{getRoleDisplayName(user?.role)}</p>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
