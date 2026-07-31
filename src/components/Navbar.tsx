import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useSocketStore } from '../store/useSocketStore';
import { LogoFull } from './Logo';

export default function Navbar() {
  const auth = useAuthStore();
  const disconnectSocket = useSocketStore((s) => s.disconnect);
  const navigate = useNavigate();

  const logout = () => {
    disconnectSocket();
    auth.logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <LogoFull size="sm" />
        <nav className="flex items-center gap-1">
          {auth.user ? (
            <>
              {auth.user.role === 'rider' && (
                <Link to="/rider" className="px-3 py-2 text-sm font-semibold text-ink/70 hover:text-emerald-800 rounded-lg">
                  Radar
                </Link>
              )}
              {auth.user.role === 'passenger' && (
                <Link to="/passenger" className="px-3 py-2 text-sm font-semibold text-ink/70 hover:text-emerald-800 rounded-lg">
                  Ride
                </Link>
              )}
              <Link to="/settings" className="px-3 py-2 text-sm font-semibold text-ink/70 hover:text-emerald-800 rounded-lg">
                Settings
              </Link>
              <button
                onClick={logout}
                aria-label="Sign out"
                className="p-2 rounded-lg text-ink/50 hover:text-red-700 hover:bg-red-50 transition-colors"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="px-3 py-2 text-sm font-semibold text-ink/70 hover:text-emerald-800 rounded-lg">
                Sign in
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 text-sm font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
