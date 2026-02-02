import { useState } from 'react';
import { Menu, X, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  BarChart3,
  Settings,
  Users,
  ClipboardList,
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

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const { user, hasPermission, hasAnyPermission, logout, switchRole } = useAuth();

  const navigation = baseNavigation.filter(
    (item) =>
      ('permission' in item && item.permission && hasPermission(item.permission)) ||
      ('anyPermissions' in item && item.anyPermissions && hasAnyPermission(item.anyPermissions))
  );

  const handleLogout = () => {
    setIsOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-[88px] left-4 z-40 p-2.5 glass rounded-lg shadow-medium hover:shadow-large transition-all duration-200"
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="w-6 h-6 text-slate-700" /> : <Menu className="w-6 h-6 text-slate-700" />}
      </button>

      {/* Mobile Sidebar */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsOpen(false)}></div>
        <aside className="relative w-[280px] h-full flex flex-col glass shadow-large border-r border-slate-200/50">
          <div className="px-6 py-6 border-b border-slate-200/30">
            <div className="flex flex-col gap-1">
              <h1 className="text-[28px] font-extrabold leading-none tracking-tight gradient-text">
                Extreme Dept Kidz
              </h1>
              <p className="text-[13px] font-medium text-slate-500 pl-0.5">Inventory & POS</p>
            </div>
          </div>

          <nav className="px-3 py-6 space-y-1 flex-1 overflow-y-auto">
            {navigation.map(item => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={() => setIsOpen(false)}
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
            {!import.meta.env.PROD && (
              <label className="block">
                <span className="text-xs font-medium text-slate-500 block mb-1">Role</span>
                <select
                  value={user?.role ?? 'viewer'}
                  onChange={(e) => { switchRole(e.target.value); setIsOpen(false); }}
                  className="w-full rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                  aria-label="Switch role"
                >
                  {Object.values(ROLES).map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200/60 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-600 text-sm font-medium transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Log out
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
