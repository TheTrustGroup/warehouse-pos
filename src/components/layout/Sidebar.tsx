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
];

function getRoleDisplayName(roleId: string): string {
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase();
  return ROLES[key]?.name ?? roleId;
}

export function Sidebar() {
  const { user, hasPermission, hasAnyPermission, switchRole } = useAuth();
  const canManageUsers =
    hasPermission(PERMISSIONS.SETTINGS.MANAGE_USERS) ||
    hasPermission(PERMISSIONS.USERS.ASSIGN_ROLES) ||
    user?.role === 'viewer';

  const navigation = baseNavigation.filter(
    (item) =>
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  return (
    <aside className="fixed left-0 top-0 h-screen w-[280px] bg-glass border-r border-white/40 flex flex-col shadow-glass backdrop-blur-xl">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200/30">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold leading-none tracking-tight gradient-text">
            Extreme Dept Kidz
          </h1>
          <p className="text-[13px] font-medium text-slate-500 pl-0.5">
            Inventory & POS
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
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

      {/* User Profile with Role */}
      <div className="p-4 border-t border-slate-200/30 space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-50/80 transition-all group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user?.fullName}
            </p>
            <p className="text-xs text-slate-600 font-medium">{user?.role ? getRoleDisplayName(user.role) : '—'}</p>
          </div>
        </div>
        {canManageUsers && (
          <label className="block">
            <span className="sr-only">Switch role (for testing)</span>
            <select
              value={user?.role ?? 'viewer'}
              onChange={(e) => switchRole(e.target.value)}
              className="w-full rounded-lg border border-slate-200/60 bg-white/80 px-3 py-2 text-sm font-medium text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
