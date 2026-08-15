/**
 * Console chrome (admin spec §3 information architecture, §8 design system).
 *
 * A dark slate rail with a light content area: the moment this loads, it is
 * unmistakably an internal tool rather than the consumer app in dark mode. The
 * one piece of shared visual DNA is the Imigongo motif in the rail header and
 * the green accent — enough that it reads as the same company, without
 * borrowing the Emerald/Amber consumer brand that §8 rules out.
 */
import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  ClipboardList,
  Gauge,
  LogOut,
  Radio,
  ScrollText,
  Settings as SettingsIcon,
  Users as UsersIcon,
  Wallet,
} from 'lucide-react';
import type { AdminRole, AdminSession } from '../types';
import { fmtDuration } from '../format';
import { opsApi } from '../api';
import { ImigongoBar } from '../../components/Imigongo';

export interface NavCounts {
  pendingVerification: number;
  overSlaVerification: number;
  openDisputes: number;
  reconciliationExceptions: number;
  activeRides: number;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof Gauge;
  roles: AdminRole[];
  /** Chord key: press `g` then this to jump there. */
  chord: string;
  badge?: (c: NavCounts) => { value: number; urgent?: boolean } | null;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Gauge, roles: ['super_admin', 'support', 'finance_ops'], chord: 'd' },
  {
    to: '/verification',
    label: 'Verification Queue',
    icon: BadgeCheck,
    roles: ['super_admin', 'support', 'finance_ops'],
    chord: 'v',
    badge: (c) => (c.pendingVerification ? { value: c.pendingVerification, urgent: c.overSlaVerification > 0 } : null),
  },
  {
    to: '/live',
    label: 'Live Ops',
    icon: Radio,
    roles: ['super_admin', 'support', 'finance_ops'],
    chord: 'l',
    badge: (c) => (c.activeRides ? { value: c.activeRides } : null),
  },
  { to: '/users', label: 'Users', icon: UsersIcon, roles: ['super_admin', 'support', 'finance_ops'], chord: 'u' },
  {
    to: '/finance',
    label: 'Finance',
    icon: Wallet,
    roles: ['super_admin', 'finance_ops'],
    chord: 'f',
    badge: (c) => (c.reconciliationExceptions ? { value: c.reconciliationExceptions, urgent: true } : null),
  },
  { to: '/reports', label: 'Reports', icon: ClipboardList, roles: ['super_admin', 'support', 'finance_ops'], chord: 'r' },
  { to: '/audit', label: 'Audit Log', icon: ScrollText, roles: ['super_admin', 'support', 'finance_ops'], chord: 'a' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, roles: ['super_admin'], chord: 's' },
];

const ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super admin',
  support: 'Support',
  finance_ops: 'Finance ops',
};

export default function AdminShell({
  session,
  counts,
  onSignedOut,
  children,
}: {
  session: AdminSession;
  counts: NavCounts;
  onSignedOut: () => void;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const visible = NAV.filter((n) => n.roles.includes(session.role));

  // `g` then a letter jumps between sections — §1 explicitly authorises
  // keyboard shortcuts here. Never fires while the operator is typing.
  const [chordArmed, setChordArmed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (chordArmed) {
        const match = visible.find((n) => n.chord === e.key.toLowerCase());
        setChordArmed(false);
        if (match) {
          e.preventDefault();
          navigate(match.to);
        }
        return;
      }
      if (e.key.toLowerCase() === 'g') {
        setChordArmed(true);
        setTimeout(() => setChordArmed(false), 1500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chordArmed, navigate, visible]);

  return (
    <div className="min-h-screen flex bg-[var(--ops-bg)]">
      <aside className="w-[232px] shrink-0 bg-[var(--ops-rail)] text-slate-300 flex flex-col sticky top-0 h-screen">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0b6e4f] flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3 L21 12 L12 21 L3 12 Z" stroke="#fff" strokeWidth="1.6" />
                <path d="M12 8 L16 12 L12 16 L8 12 Z" fill="#fff" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-white leading-tight">MotoConnect</div>
              <div className="text-[11px] text-slate-400 leading-tight">Operations</div>
            </div>
          </div>
        </div>
        <ImigongoBar color="#0b6e4f" height={5} className="opacity-90" />

        <nav className="flex-1 overflow-y-auto ops-scroll px-2 py-3 space-y-0.5">
          {visible.map((item) => {
            const badge = item.badge?.(counts) ?? null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-[#0b6e4f] text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {badge ? (
                  <span
                    className={`ops-num rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      badge.urgent ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {badge.value > 99 ? '99+' : badge.value}
                  </span>
                ) : (
                  <kbd className="hidden group-hover:inline text-[10px] text-slate-500 font-mono">g {item.chord}</kbd>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="text-[12px] font-semibold text-white truncate" title={session.email}>
            {session.email}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-slate-400">{ROLE_LABEL[session.role]}</span>
            {session.mfaEnabled ? (
              <span className="text-[10px] font-bold text-[#3aa07c] uppercase tracking-wide">2FA</span>
            ) : null}
          </div>
          <SessionCountdown expiresAt={session.sessionExpiresAt} />
          <button
            onClick={async () => {
              await opsApi('/auth/logout', { method: 'POST' }).catch(() => {});
              onSignedOut();
            }}
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700
              px-2 py-1.5 text-[12px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {chordArmed ? (
          <div className="fixed bottom-4 left-[248px] z-[800] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-200">
            Go to… press {visible.map((n) => n.chord).join(' / ')}
          </div>
        ) : null}
        <div className="p-5 max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}

/** §2.3 — no indefinite sessions. Showing the remaining time is the honest way to say so. */
function SessionCountdown({ expiresAt }: { expiresAt: string | null }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  return (
    <div className="text-[10px] text-slate-500 mt-1">Session ends in {fmtDuration(remaining)}</div>
  );
}
