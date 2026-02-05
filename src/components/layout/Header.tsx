// src/components/layout/Header.tsx - Premium Glass Header
import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ROLES } from '../../types/permissions';
import { PERMISSIONS } from '../../types/permissions';

function getRoleDisplayName(roleId: string): string {
  const key = roleId === 'super_admin' ? 'SUPER_ADMIN' : roleId.toUpperCase();
  return ROLES[key]?.name ?? roleId;
}

export function Header() {
  const navigate = useNavigate();
  const { user, logout, switchRole, hasPermission } = useAuth();
  // Show role switcher to admins, or to anyone so viewer/accountant isn't stuck (e.g. production build without VITE_SUPER_ADMIN_EMAILS)
  const canSwitchRole =
    !!user &&
    (user.role === 'admin' ||
      user.role === 'super_admin' ||
      hasPermission(PERMISSIONS.SETTINGS.MANAGE_USERS) ||
      hasPermission(PERMISSIONS.USERS.ASSIGN_ROLES) ||
      user.role === 'viewer');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/inventory?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <header className="fixed top-0 left-0 lg:left-[280px] right-0 h-[72px] bg-glass border-b border-white/40 flex items-center justify-between px-4 lg:px-8 z-10 backdrop-blur-xl">
      {/* Search Bar */}
      <div className="flex-1 max-w-2xl">
        <form onSubmit={handleSearch} className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" strokeWidth={2} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, SKU, or barcode..."
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/60 focus:border-primary-500 focus:bg-white focus:shadow-lg focus:shadow-primary-500/10 outline-none transition-all duration-200 text-sm font-medium placeholder:text-slate-400 backdrop-blur-sm"
            aria-label="Search products, SKU, or barcode"
          />
        </form>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {/* Role: show current role and switcher for admins */}
        {user && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 hidden sm:inline">{getRoleDisplayName(user.role)}</span>
            {canSwitchRole && (
              <select
                value={user.role ?? 'viewer'}
                onChange={(e) => switchRole(e.target.value)}
                className="rounded-lg border border-slate-200/60 bg-white/90 px-3 py-2 text-sm font-medium text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 min-w-[140px]"
                aria-label="Switch role"
                title="Switch role (for testing)"
              >
                {Object.values(ROLES).map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {/* Log out - visible on all screens including mobile */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200/60 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-600 text-sm font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none"
          title="Log out"
          aria-label="Log out"
        >
          {isLoggingOut ? (
            <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" aria-hidden />
          ) : (
            <LogOut className="w-5 h-5" />
          )}
          <span className="hidden sm:inline">{isLoggingOut ? 'Signing out…' : 'Log out'}</span>
        </button>
        {/* Notifications - Coming soon */}
        <button
          type="button"
          className="relative p-2.5 hover:bg-slate-50/80 rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="View notifications"
          title="Notifications coming soon"
          disabled
        >
          <Bell className="w-5 h-5 text-slate-600 group-hover:text-slate-900 transition-colors" strokeWidth={2} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary-500 rounded-full ring-2 ring-white shadow-lg" aria-hidden="true"></span>
        </button>
      </div>
    </header>
  );
}
