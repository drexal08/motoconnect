import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogoFull } from './Logo';
import {
  IconHome,
  IconMapPin,
  IconGrid,
  IconSettings,
  IconLogout,
  IconMenu,
  IconX,
  IconBuy,
  IconLocation,
  IconLogin,
} from './Icons';
import { useAuth } from '@/contexts/AuthContext';

const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    navigate('/');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLink = (to: string, label: string, icon: React.ReactNode) => (
    <Link
      to={to}
      onClick={() => setMobileOpen(false)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-all
        ${isActive(to)
          ? 'text-primary-600 bg-primary-50'
          : 'text-gray-500 hover:text-gray-800 hover:bg-surface-secondary'
        }`}
    >
      {icon}
      {label}
    </Link>
  );

  const getDashboardPath = () => {
    if (!user) return '/';
    return user.role === 'passenger' ? '/passenger' : '/rider';
  };

  const getDashboardLabel = () => {
    if (!user) return 'Dashboard';
    return user.role === 'passenger' ? 'My Rides' : 'Find Passengers';
  };

  const getDashboardIcon = () => {
    if (!user) return <IconGrid size={18} />;
    return user.role === 'passenger' ? <IconLocation size={18} /> : <IconMapPin size={18} />;
  };

  const roleBadge: Record<string, { label: string; color: string }> = {
    passenger: { label: 'Passenger', color: 'bg-primary-50 text-primary-600' },
    rider: { label: 'Rider', color: 'bg-emerald-50 text-emerald-600' },
  };

  return (
    <nav className="bg-white border-b border-[#e3e6ed] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-[60px]">
          <Link to="/" onClick={() => setMobileOpen(false)} className="group">
            <LogoFull size="md" />
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLink('/', 'Home', <IconHome size={18} />)}
            {isAuthenticated && navLink(getDashboardPath(), getDashboardLabel(), getDashboardIcon())}
            {isAuthenticated && user?.role === 'rider' && navLink('/pricing', 'Pricing', <IconBuy size={18} />)}
          </div>

          <div className="hidden md:flex items-center gap-2.5">
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2.5 border border-[#e3e6ed] rounded-full pl-1 pr-3 py-1">
                  <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 text-xs font-bold">{user?.name?.charAt(0)}</span>
                  </div>
                  <div className="flex flex-col leading-none">
                    <span className="text-xs font-semibold text-gray-800">{user?.name?.split(' ')[0]}</span>
                    <span className={`text-[9px] font-semibold mt-0.5 px-1.5 py-px rounded-full w-fit ${roleBadge[user?.role || 'passenger'].color}`}>
                      {roleBadge[user?.role || 'passenger'].label}
                    </span>
                  </div>
                </div>
                <Link
                  to="/settings"
                  className={`p-2 rounded-lg transition-all ${
                    isActive('/settings')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-surface-secondary'
                  }`}
                  title="Settings"
                >
                  <IconSettings size={18} />
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-surface-secondary transition-all"
                  title="Logout"
                >
                  <IconLogout size={18} />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-[13px] font-medium text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg hover:bg-surface-secondary transition-all"
                >
                  Log in
                </Link>
                <Link
                  to="/signup"
                  className="text-[13px] font-semibold text-white bg-primary-600 hover:bg-primary-700 px-4 py-2 rounded-lg transition-all shadow-sm hover:shadow"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-surface-secondary"
          >
            {mobileOpen ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-[#e3e6ed] bg-white animate-fade-in">
          <div className="px-4 py-3 space-y-1">
            {navLink('/', 'Home', <IconHome size={18} />)}
            {isAuthenticated && navLink(getDashboardPath(), getDashboardLabel(), getDashboardIcon())}
            {isAuthenticated && user?.role === 'rider' && navLink('/pricing', 'Pricing', <IconBuy size={18} />)}
            <hr className="my-2 border-[#e3e6ed]" />
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <span className="text-primary-600 text-sm font-bold">{user?.name?.charAt(0)}</span>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{user?.name}</div>
                    <div className="text-xs text-gray-400">{user?.email}</div>
                  </div>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    isActive('/settings')
                      ? 'text-primary-600 bg-primary-50'
                      : 'text-gray-600 hover:bg-surface-secondary'
                  }`}
                >
                  <IconSettings size={18} /> Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-[13px] font-medium text-red-500 hover:bg-red-50 transition-all"
                >
                  <IconLogout size={18} /> Log out
                </button>
              </>
            ) : (
              <div className="flex gap-2 pt-1">
                <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 text-center text-[13px] font-medium text-gray-700 border border-[#e3e6ed] py-2 rounded-lg hover:bg-surface-secondary">
                  <span className="flex items-center justify-center gap-1"><IconLogin size={16} /> Log in</span>
                </Link>
                <Link to="/signup" onClick={() => setMobileOpen(false)} className="flex-1 text-center text-[13px] font-semibold text-white bg-primary-600 py-2 rounded-lg hover:bg-primary-700">
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
