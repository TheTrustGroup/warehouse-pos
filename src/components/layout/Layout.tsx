import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileMenu } from './MobileMenu';

export function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile Menu */}
      <MobileMenu />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="lg:ml-[280px] mt-[72px] pt-20 lg:pt-8 p-4 lg:p-8 min-h-[calc(100vh-72px)]">
        <Outlet />
      </main>
    </div>
  );
}
