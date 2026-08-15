/**
 * Ops-console root (admin spec §2.3, §2.4).
 *
 * Session handling lives here rather than in a store, because there is exactly
 * one thing to track: is there a live server session. The token is opaque and
 * server-validated, so the client never decides whether it is signed in — it
 * asks, and reacts to the answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminShell, { type NavCounts } from './components/AdminShell';
import { Spinner, ToastProvider } from './components/ui';
import LoginPage from './pages/LoginPage';
import SetupPage from './pages/SetupPage';
import DashboardPage from './pages/DashboardPage';
import VerificationPage from './pages/VerificationPage';
import LiveOpsPage from './pages/LiveOpsPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import FinancePage from './pages/FinancePage';
import ReportsPage from './pages/ReportsPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import { clearAdminToken, getAdminToken, opsApi } from './api';
import type { AdminSession, DashboardSummary } from './types';

const EMPTY_COUNTS: NavCounts = {
  pendingVerification: 0,
  overSlaVerification: 0,
  openDisputes: 0,
  reconciliationExceptions: 0,
  activeRides: 0,
};

export default function AdminApp() {
  return (
    <HashRouter>
      <ToastProvider>
        <AdminRoutes />
      </ToastProvider>
    </HashRouter>
  );
}

function AdminRoutes() {
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [counts, setCounts] = useState<NavCounts>(EMPTY_COUNTS);

  const isSetupRoute = location.pathname.startsWith('/setup');

  const loadSession = useCallback(async () => {
    if (!getAdminToken()) {
      setSession(null);
      setChecking(false);
      return;
    }
    try {
      setSession(await opsApi<AdminSession>('/auth/me'));
    } catch {
      clearAdminToken();
      setSession(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (isSetupRoute) {
      setChecking(false);
      return;
    }
    loadSession();
  }, [loadSession, isSetupRoute]);

  // The API client raises this when the server ends a session mid-flight —
  // an idle timeout, an absolute expiry, or the account being suspended.
  useEffect(() => {
    const onEnded = () => setSession(null);
    window.addEventListener('ops:session-ended', onEnded);
    return () => window.removeEventListener('ops:session-ended', onEnded);
  }, []);

  // Nav badge counts. Support and finance_ops roles get a 403 on parts of the
  // dashboard payload they cannot see; a failed poll simply leaves the badges
  // at their last value rather than breaking the shell.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = async () => {
      try {
        const d = await opsApi<DashboardSummary>('/dashboard');
        if (cancelled) return;
        setCounts({
          pendingVerification: d.pendingVerification.count,
          overSlaVerification: d.pendingVerification.overSla,
          openDisputes: d.openDisputes,
          reconciliationExceptions: d.reconciliationExceptions,
          activeRides: d.activeRides,
        });
      } catch {
        /* leave the previous counts in place */
      }
    };
    load();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session]);

  // The password-set flow is reachable without a session, by design.
  if (isSetupRoute) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--ops-rail)]">
        <div className="text-slate-300">
          <Spinner label="Checking your session…" />
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage onAuthenticated={loadSession} />;
  }

  return (
    <AdminShell
      session={session}
      counts={counts}
      onSignedOut={() => {
        clearAdminToken();
        setSession(null);
      }}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/verification" element={<VerificationPage />} />
        <Route path="/live" element={<LiveOpsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:userId" element={<UserDetailPage />} />
        {/* Role gating is enforced server-side; the client mirrors it so a
            support user is never shown a screen that will only 403. */}
        {session.role === 'super_admin' || session.role === 'finance_ops' ? (
          <Route path="/finance" element={<FinancePage />} />
        ) : null}
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        {session.role === 'super_admin' ? (
          <Route path="/settings" element={<SettingsPage session={session} />} />
        ) : null}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AdminShell>
  );
}

function NotFound() {
  return (
    <div className="ops-card p-8 text-center">
      <h2 className="text-[15px] font-semibold text-slate-900">Page not found</h2>
      <p className="text-[12px] text-slate-500 mt-1">
        That screen does not exist, or your role does not have access to it.
      </p>
    </div>
  );
}
