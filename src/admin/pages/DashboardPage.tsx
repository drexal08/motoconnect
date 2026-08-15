/**
 * Dashboard home (admin spec §10).
 *
 * A fixed status page answering one question — "is the business okay right
 * now" — not a configurable BI surface. Every tile links to the screen where
 * you can act on it, because a number you cannot act on is decoration.
 */
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  MessageSquareWarning,
  Radio,
  Scale,
  Timer,
} from 'lucide-react';
import { Card, ErrorNote, Spinner } from '../components/ui';
import { useQuery } from '../hooks';
import { fmtAge, fmtNumber, fmtPercent, fmtRwf } from '../format';
import type { DashboardSummary } from '../types';

interface Trend {
  days: { day: string; rides: number; completed: number; revenue: number }[];
}

export default function DashboardPage() {
  const summary = useQuery<DashboardSummary>('/dashboard', { pollMs: 30_000 });
  const trends = useQuery<Trend>('/dashboard/trends?days=14');

  if (summary.initialLoading) return <Spinner label="Loading business health…" />;
  if (summary.error) return <ErrorNote message={summary.error} onRetry={summary.reload} />;
  if (!summary.data) return null;

  const d = summary.data;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[17px] font-bold text-slate-900">Dashboard</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Live status. Refreshes every 30 seconds while this tab is open.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <Tile
          to="/live"
          icon={<Radio size={16} />}
          label="Active rides right now"
          value={fmtNumber(d.activeRides)}
          sub={`${fmtNumber(d.waitingRequests)} waiting to be claimed`}
        />

        <Tile
          to="/verification"
          icon={<BadgeCheck size={16} />}
          label="Riders pending verification"
          value={fmtNumber(d.pendingVerification.count)}
          /* §10 — red when anything has aged past 48 h. */
          urgent={d.pendingVerification.overSla > 0}
          sub={
            d.pendingVerification.overSla > 0
              ? `${fmtNumber(d.pendingVerification.overSla)} waiting over 48 hours`
              : d.pendingVerification.oldestSubmittedAt
                ? `Oldest waiting ${fmtAge(d.pendingVerification.oldestSubmittedAt)}`
                : 'Queue is clear'
          }
        />

        <Tile
          to="/finance"
          icon={<Banknote size={16} />}
          label="Revenue today"
          value={fmtRwf(d.revenue.todayRwf)}
          sub={`${fmtNumber(d.revenue.todayCount)} payment(s) · ${fmtRwf(d.revenue.weekRwf)} this week`}
        />

        <Tile
          to="/live?tab=disputes"
          icon={<MessageSquareWarning size={16} />}
          label="Open disputes"
          value={fmtNumber(d.openDisputes)}
          urgent={d.openDisputes > 0}
          sub="No-shows and rides rated 2 stars or below"
        />

        <Tile
          to="/verification"
          icon={<Timer size={16} />}
          label="Verification throughput"
          value={fmtPercent(d.verificationThroughput.approvalRate)}
          sub={
            d.verificationThroughput.medianHoursToDecision === null
              ? `No decisions in the last ${d.verificationThroughput.windowDays} days`
              : `approved · median ${d.verificationThroughput.medianHoursToDecision.toFixed(1)}h to decide (7d)`
          }
        />

        {/*
          §10 — this should be zero. Any other number belongs on screen the
          moment you sign in, not buried in a monthly report.
        */}
        <Tile
          to="/finance?tab=reconciliation"
          icon={<Scale size={16} />}
          label="Payment reconciliation exceptions"
          value={fmtNumber(d.reconciliationExceptions)}
          urgent={d.reconciliationExceptions > 0}
          sub={
            d.reconciliationExceptions > 0
              ? 'Payments and subscriptions do not line up — investigate'
              : 'Payments and subscriptions agree'
          }
        />
      </div>

      <Card>
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-[13px] font-semibold text-slate-900">Last 14 days</h2>
            <p className="text-[12px] text-slate-500 mt-0.5">Ride requests, completions and revenue.</p>
          </div>
          <Link to="/reports" className="text-[12px] font-semibold text-[#0b6e4f] inline-flex items-center gap-1">
            Full reports <ArrowRight size={13} />
          </Link>
        </div>
        {trends.initialLoading ? (
          <Spinner />
        ) : trends.data?.days?.length ? (
          <TrendChart days={trends.data.days} />
        ) : (
          <p className="text-[12px] text-slate-500 py-6 text-center">No activity in this window yet.</p>
        )}
      </Card>
    </div>
  );
}

function Tile({
  to,
  icon,
  label,
  value,
  sub,
  urgent = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`ops-card p-4 block transition-colors hover:border-[#0b6e4f] ${
        urgent ? 'border-red-300 bg-red-50/40' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
          urgent ? 'text-red-700' : 'text-slate-500'
        }`}>
          {urgent ? <AlertTriangle size={13} /> : icon}
          <span className="truncate">{label}</span>
        </span>
        <ArrowRight size={13} className="text-slate-300 shrink-0" />
      </div>
      <div className={`ops-num text-[24px] font-bold leading-none ${urgent ? 'text-red-800' : 'text-slate-900'}`}>
        {value}
      </div>
      <div className="text-[12px] text-slate-500 mt-1.5">{sub}</div>
    </Link>
  );
}

/**
 * Inline SVG bars — a 14-point series does not justify a charting dependency.
 * Revenue is the bar, completed rides the line; both are labelled, and the
 * values are in the tooltip so the chart is never the only way to read them.
 */
function TrendChart({ days }: { days: { day: string; rides: number; completed: number; revenue: number }[] }) {
  const maxRevenue = Math.max(1, ...days.map((d) => d.revenue));
  const maxRides = Math.max(1, ...days.map((d) => d.rides));
  const W = 100;
  const H = 42;
  const step = W / Math.max(1, days.length);

  const line = days
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${(i + 0.5) * step},${H - (d.completed / maxRides) * (H - 4)}`)
    .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[120px]" role="img"
           aria-label="Daily revenue bars with completed rides overlaid">
        {days.map((d, i) => {
          const h = (d.revenue / maxRevenue) * (H - 4);
          return (
            <rect
              key={d.day}
              x={i * step + step * 0.18}
              y={H - h}
              width={step * 0.64}
              height={h}
              fill="#c8e9dd"
              rx={0.6}
            >
              <title>{`${d.day}: ${d.revenue.toLocaleString('en-US')} RWF · ${d.rides} requested · ${d.completed} completed`}</title>
            </rect>
          );
        })}
        <path d={line} fill="none" stroke="#0b6e4f" strokeWidth={0.9} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#c8e9dd]" /> Revenue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-[#0b6e4f]" /> Completed rides
          </span>
        </span>
        <span className="ops-num">
          {days[0]?.day} → {days[days.length - 1]?.day}
        </span>
      </div>
    </div>
  );
}
