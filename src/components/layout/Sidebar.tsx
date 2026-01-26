// src/components/layout/Sidebar.tsx - Premium Figma-Inspired Design
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ClipboardList,
  BarChart3,
  Settings,
  Users,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSIONS } from '../../types/permissions';

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

export function Sidebar() {
  const { user, hasPermission, hasAnyPermission, login, logout } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const navigation = baseNavigation.filter(
    (item) =>
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  const switchUser = async (username: string) => {
    await login(username, 'password');
    setShowUserMenu(false);
    window.location.reload();
  };

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
    navigate('/login', { replace: true });
  };

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

      {/* User Profile with Role Switcher */}
      <div className="p-4 border-t border-slate-200/30 space-y-2">
        <div
          className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50 hover:bg-slate-50/80 transition-all cursor-pointer group"
          onClick={() => setShowUserMenu(!showUserMenu)}
          onKeyDown={(e) => e.key === 'Enter' && setShowUserMenu(!showUserMenu)}
          role="button"
          tabIndex={0}
          aria-expanded={showUserMenu}
          aria-haspopup="true"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:shadow-xl transition-shadow">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {user?.fullName}
            </p>
            <p className="text-xs text-slate-500 font-medium capitalize">
              {user?.role}
            </p>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
        </div>

        {/* Always-visible Log out button */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200/60 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-600 text-sm font-medium transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Log out
        </button>

        {/* User Menu Dropdown (Switch User Demo) */}
        {showUserMenu && (
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 bg-slate-50">
              Switch User (Demo)
            </p>
            <button
              type="button"
              onClick={() => switchUser('admin')}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
            >
              Administrator
            </button>
            <button
              type="button"
              onClick={() => switchUser('manager')}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
            >
              Store Manager
            </button>
            <button
              type="button"
              onClick={() => switchUser('cashier')}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm"
            >
              Cashier
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
