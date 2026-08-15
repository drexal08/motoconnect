import { Bike, Check, Flag, MapPin, Search, UserCheck } from 'lucide-react';
import type { RequestStatus } from '../api/types';
import { ImigongoCorner } from './Imigongo';

/**
 * The passenger's "where is my ride" card.
 *
 * Structure adapted from the 21st.dev Order Status Card pattern — a vertical
 * timeline with a dashed connector and icons that punch through it via a ring
 * in the background colour. Two deliberate departures from the original:
 *
 *  • No framer-motion. It is ~50 kB for entrance animation, and this app is
 *    opened on mobile data in Kigali. The same effect comes from the CSS
 *    keyframes already in the Tailwind config.
 *  • Imigongo corners, following the same treatment BusBook gives its boarding
 *    pass. This card is MotoConnect's equivalent moment — the thing a passenger
 *    holds and looks at while they wait — so it earns the cultural motif that
 *    ordinary screens do not.
 *
 * Accessibility: the whole card is a live region. A passenger watching for
 * their rider gets each state change announced instead of having to notice a
 * colour shift, and every step carries a text label rather than relying on the
 * icon alone.
 */

interface Step {
  key: string;
  label: string;
  detail: string;
  icon: typeof Bike;
  /** Statuses at which this step counts as reached. */
  reachedAt: RequestStatus[];
}

const STEPS: Step[] = [
  {
    key: 'requested',
    label: 'Ride requested',
    detail: 'Nearby riders can see your request.',
    icon: Search,
    reachedAt: ['VISIBLE', 'CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  },
  {
    key: 'claimed',
    label: 'A rider wants this ride',
    detail: 'Check their details and confirm to accept them.',
    icon: UserCheck,
    reachedAt: ['CLAIMED', 'CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  },
  {
    key: 'confirmed',
    label: 'Rider confirmed',
    detail: 'They now have your exact pickup point.',
    icon: Check,
    reachedAt: ['CONFIRMED', 'EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  },
  {
    key: 'enroute',
    label: 'On the way to you',
    detail: 'Follow them on the map below.',
    icon: Bike,
    reachedAt: ['EN_ROUTE', 'ARRIVED', 'COMPLETED'],
  },
  {
    key: 'arrived',
    label: 'Your rider has arrived',
    detail: 'Look for them at your pickup point.',
    icon: MapPin,
    reachedAt: ['ARRIVED', 'COMPLETED'],
  },
  {
    key: 'completed',
    label: 'Ride finished',
    detail: 'Rate your rider so others know what to expect.',
    icon: Flag,
    reachedAt: ['COMPLETED'],
  },
];

/** Plain-English summary, used as the live announcement and the card heading. */
const HEADLINE: Partial<Record<RequestStatus, string>> = {
  VISIBLE: 'Looking for a rider',
  CLAIMED: 'A rider wants your ride',
  CONFIRMED: 'Your rider is coming',
  EN_ROUTE: 'Your rider is on the way',
  ARRIVED: 'Your rider has arrived',
  COMPLETED: 'Ride finished',
};

export default function RideProgress({
  status,
  riderName,
  plate,
  className = '',
}: {
  status: RequestStatus;
  riderName?: string | null;
  plate?: string | null;
  className?: string;
}) {
  const currentIndex = STEPS.reduce(
    (last, step, i) => (step.reachedAt.includes(status) ? i : last),
    -1
  );

  return (
    <section
      className={`relative imigongo-card rounded-3xl overflow-hidden animate-slide-up ${className}`}
      aria-label="Ride progress"
    >
      {/* Cultural framing on the card a passenger actually sits and watches. */}
      <ImigongoCorner position="top-left" size={52} color="#0b6e4f" opacity={0.14} />
      <ImigongoCorner position="top-right" size={52} color="#0b6e4f" opacity={0.14} />

      <header className="px-5 pt-6 pb-4 text-center">
        <h2 className="text-lg font-bold text-ink">{HEADLINE[status] ?? 'Your ride'}</h2>
        {riderName && (
          <p className="mt-1 text-sm text-ink-muted">
            <strong className="text-ink">{riderName}</strong>
            {plate ? <> · plate {plate}</> : null}
          </p>
        )}
      </header>

      {/*
        One live region for the whole timeline. `polite` so it waits for a
        natural pause rather than cutting across whatever is being read.
      */}
      <ol className="px-5 pb-6 space-y-1" aria-live="polite" aria-atomic="false">
        {STEPS.map((step, i) => {
          const reached = i <= currentIndex;
          const isCurrent = i === currentIndex;
          const isLast = i === STEPS.length - 1;
          const Icon = step.icon;

          return (
            <li key={step.key} className="relative flex items-start gap-3.5 pb-4 last:pb-0">
              {/* Connector, drawn behind the icon and stopped short of the last row. */}
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`absolute left-[17px] top-[38px] bottom-0 w-px border-l-2 ${
                    i < currentIndex ? 'border-emerald-600 border-solid' : 'border-border border-dashed'
                  }`}
                />
              )}

              <span
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                  ring-4 ring-surface-card transition-colors ${
                    isCurrent
                      ? 'bg-emerald-700 text-white'
                      : reached
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-muted text-ink-subtle'
                  }`}
              >
                <Icon size={17} aria-hidden="true" />
                {/* A pulse marks the live step without relying on colour alone. */}
                {isCurrent && status !== 'COMPLETED' && (
                  <span className="absolute inset-0 rounded-full bg-emerald-600 opacity-40 animate-pulse-dot" />
                )}
              </span>

              <div className="min-w-0 flex-1 pt-1">
                <p
                  className={`text-sm font-semibold ${
                    isCurrent ? 'text-ink' : reached ? 'text-ink-muted' : 'text-ink-subtle'
                  }`}
                >
                  {step.label}
                  {/* Text, not just styling, so the state survives a screen reader. */}
                  {isCurrent && <span className="sr-only"> — current step</span>}
                  {reached && !isCurrent && <span className="sr-only"> — done</span>}
                </p>
                {isCurrent && (
                  <p className="mt-0.5 text-xs text-ink-muted leading-relaxed">{step.detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
