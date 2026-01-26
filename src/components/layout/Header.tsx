// src/components/layout/Header.tsx - Premium Glass Header
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function Header() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="fixed top-0 left-0 lg:left-[280px] right-0 h-[72px] bg-glass border-b border-white/40 flex items-center justify-between px-4 lg:px-8 z-10 backdrop-blur-xl">
      {/* Search Bar */}
      <div className="flex-1 max-w-2xl">
        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-primary-500 transition-colors" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search products, SKU, or barcode..."
            className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-50/80 border border-slate-200/60 focus:border-primary-500 focus:bg-white focus:shadow-lg focus:shadow-primary-500/10 outline-none transition-all duration-200 text-sm font-medium placeholder:text-slate-400 backdrop-blur-sm"
            aria-label="Search products, SKU, or barcode"
          />
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Log out - visible on all screens including mobile */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200/60 bg-white hover:bg-red-50 hover:border-red-200 text-slate-700 hover:text-red-600 text-sm font-medium transition-colors"
          title="Log out"
          aria-label="Log out"
        >
          <LogOut className="w-5 h-5" />
          <span className="hidden sm:inline">Log out</span>
        </button>
        {/* Notifications */}
        <button
          className="relative p-2.5 hover:bg-slate-50/80 rounded-xl transition-all duration-200 group min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5 text-slate-600 group-hover:text-slate-900 transition-colors" strokeWidth={2} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary-500 rounded-full ring-2 ring-white shadow-lg" aria-hidden="true"></span>
        </button>
      </div>
    </header>
  );
}
