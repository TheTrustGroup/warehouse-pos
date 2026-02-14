// src/components/layout/Sidebar.tsx - Premium Figma-Inspired Design
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSIONS, ROLES } from '../../types/permissions';

const baseNavigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD.VIEW },
  { name: 'Inventory', to: '/inventory', icon: Package, permission: PERMISSIONS.INVENTORY.VIEW },
  { name: 'Orders', to: '/orders', icon: ClipboardList, permission: PERMISSIONS.ORDERS.VIEW },
  { name: 'POS', to: '/pos', icon: ShoppingCart, permission: PERMISSIONS.POS.ACCESS },
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
  { name: 'Liquid Glass Demo', to: '/demo/liquid-glass-showcase', icon: Sparkles, permission: undefined },
];

function getRoleDisplayName(roleId: string | undefined): string {
  if (roleId == null || roleId === '') return '—';
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase().replace(/\s+/g, '_');
  return ROLES[key]?.name ?? roleId;
}

export function Sidebar() {
  const { user, hasPermission, hasAnyPermission, switchRole } = useAuth();
  // Hardening: only admins see "Switch role" (testing). Others cannot try to switch; backend enforces 403.
  const canSeeSwitchRole = user?.role === 'admin' || user?.role === 'super_admin';

  const navigation = baseNavigation.filter(
    (item) =>
      (item.permission == null && 'to' in item) ||
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-[280px] glass border-r border-white/40 flex flex-col shadow-glass">
      {/* Logo: hierarchy via size, not weight overload */}
      <div className="p-5 border-b border-slate-200/30">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-bold leading-tight tracking-tight gradient-text">
            Extreme Dept Kidz
          </h1>
          <p className="text-xs font-medium text-slate-500">
            Inventory & POS
          </p>
        </div>
      </div>

      {/* Nav: vertical rhythm space-y-1, touch targets via .nav-item */}
      <nav className="flex-1 py-5 px-2 space-y-1 overflow-y-auto">
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

      <div className="p-4 border-t border-slate-200/30 space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-100/60 transition-colors">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user?.fullName}
            </p>
            <p className="text-xs text-slate-600 font-medium">{getRoleDisplayName(user?.role)}</p>
          </div>
        </div>
        {canSeeSwitchRole && (
          <label className="block">
            <span className="sr-only">Switch role (for testing)</span>
            <select
              value={user?.role ?? 'viewer'}
              onChange={(e) => switchRole(e.target.value)}
              className="input-field w-full text-sm font-medium text-slate-900"
              aria-label="Switch role to see different features"
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
    </aside>
  );
}
