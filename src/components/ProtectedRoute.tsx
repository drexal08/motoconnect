import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { Spinner } from './ui';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<'passenger' | 'rider'>;
  /** Riders behind the §4.2 verification gate (can't see requests until verified). */
  requireVerifiedRider?: boolean;
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireVerifiedRider = false,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const auth = useAuthStore();
  const location = useLocation();

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner label="Loading your session…" />
      </div>
    );
  }

  if (!auth.user) {
    return <Navigate to={redirectTo} state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(auth.user.role)) {
    const fallback = auth.user.role === 'passenger' ? '/passenger' : '/rider';
    return <Navigate to={fallback} replace />;
  }

  if (requireVerifiedRider && auth.riderVerification !== 'verified') {
    return <Navigate to="/rider/verification" replace />;
  }

  return <>{children}</>;
}
