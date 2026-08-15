/**
 * Ops-console primitives (admin spec §8).
 *
 * Dense, neutral, keyboard-friendly. No consumer-app skeleton shimmer on every
 * micro-interaction — §1 explicitly discourages that here. Loading feedback is
 * matched to the expected wait instead: inline text for fast fetches, a spinner
 * only where a request genuinely takes a moment.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react';

// ─── buttons ─────────────────────────────────────────────────────────────────

type ButtonTone = 'primary' | 'neutral' | 'danger' | 'ghost' | 'warn';

const BUTTON_TONES: Record<ButtonTone, string> = {
  primary: 'bg-[#0b6e4f] text-white hover:bg-[#0a5c43] border-transparent',
  neutral: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
  danger: 'bg-red-700 text-white hover:bg-red-800 border-transparent',
  warn: 'bg-amber-600 text-white hover:bg-amber-700 border-transparent',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 border-transparent',
};

export function Button({
  children,
  tone = 'neutral',
  size = 'md',
  loading = false,
  icon,
  className = '',
  ...rest
}: {
  children?: ReactNode;
  tone?: ButtonTone;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-3.5 py-2 text-[13px]';
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed ${pad} ${BUTTON_TONES[tone]} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── status badges ───────────────────────────────────────────────────────────

export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-[#0a5c43] ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

/**
 * Compact labels stay on one line (they are read down a column), so the label
 * never wraps — it truncates with the full value available on hover and focus.
 */
export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: BadgeTone; title?: string }) {
  return (
    <span
      title={title}
      tabIndex={title ? 0 : undefined}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold
        ring-1 ring-inset whitespace-nowrap max-w-full ${BADGE_TONES[tone]}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** One place that maps a ride status to a colour, so map and tables never disagree. */
export const RIDE_STATUS_TONE: Record<string, BadgeTone> = {
  CREATED: 'neutral',
  VISIBLE: 'blue',
  CLAIMED: 'amber',
  CONFIRMED: 'violet',
  EN_ROUTE: 'green',
  ARRIVED: 'green',
  COMPLETED: 'neutral',
  EXPIRED: 'neutral',
  EXPIRED_UNCLAIMED: 'neutral',
  CANCELLED_BY_PASSENGER: 'red',
  CANCELLED_BY_RIDER: 'red',
  NO_SHOW: 'red',
};

/** Matching hex values for the Leaflet markers — same source of truth. */
export const RIDE_STATUS_COLOR: Record<string, string> = {
  VISIBLE: '#2563eb',
  CLAIMED: '#d97706',
  CONFIRMED: '#7c3aed',
  EN_ROUTE: '#0b6e4f',
  ARRIVED: '#15803d',
};

export function RideStatusBadge({ status }: { status: string }) {
  return <Badge tone={RIDE_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

export function AccountStatusBadge({ status }: { status: string }) {
  const tone: BadgeTone = status === 'active' ? 'green' : status === 'suspended' ? 'amber' : 'red';
  return <Badge tone={tone}>{status}</Badge>;
}

export function VerificationBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const tone: BadgeTone =
    status === 'verified' ? 'green' : status === 'rejected' ? 'red' : 'amber';
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>;
}

// ─── layout bits ─────────────────────────────────────────────────────────────

export function Card({ children, className = '', pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`ops-card ${pad ? 'p-4' : ''} ${className}`}>{children}</div>;
}

export function SectionTitle({
  children,
  hint,
  right,
}: {
  children: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-3">
      <div>
        <h2 className="text-[13px] font-semibold text-slate-900">{children}</h2>
        {hint ? <p className="text-[12px] text-slate-500 mt-0.5">{hint}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function KeyValue({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</dt>
      <dd className={`text-[13px] text-slate-900 break-words ${mono ? 'ops-mono' : ''}`}>{children}</dd>
    </div>
  );
}

export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <div className="text-slate-300 mb-2">{icon ?? <Info size={22} />}</div>
      <p className="text-[13px] font-semibold text-slate-700">{title}</p>
      {body ? <p className="text-[12px] text-slate-500 mt-1 max-w-sm">{body}</p> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-slate-500 text-[13px]" role="status" aria-busy="true">
      <Loader2 size={16} className="animate-spin" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-800">
      <AlertTriangle size={15} className="mt-px shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry ? (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function InfoNote({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'amber' }) {
  const cls =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-blue-200 bg-blue-50 text-blue-900';
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-[12px] ${cls}`}>
      <Info size={15} className="mt-px shrink-0" />
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ─── form fields ─────────────────────────────────────────────────────────────

const FIELD_BASE =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-[#0b6e4f] focus:outline-none focus:ring-1 focus:ring-[#0b6e4f]';

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      {/* Visible label, always — never a placeholder standing in for one. */}
      <span className="block text-[12px] font-semibold text-slate-700 mb-1">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {/* Errors sit next to the field they belong to, not in a summary at the top. */}
      {error ? <span className="block text-[11px] text-red-700 mt-1">{error}</span> : null}
      {!error && hint ? <span className="block text-[11px] text-slate-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${FIELD_BASE} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${FIELD_BASE} min-h-[72px] resize-y ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${FIELD_BASE} ${props.className ?? ''}`} />;
}

// ─── pagination ──────────────────────────────────────────────────────────────

/**
 * §6.1 — paged, not infinite scroll. Row positions must stay stable while an
 * admin is acting on the list.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-200 text-[12px] text-slate-600">
      <span className="ops-num">
        {from}–{to} of {total.toLocaleString('en-US')}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" tone="neutral" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft size={14} />
        </Button>
        <span className="px-2 ops-num">
          {page} / {pages}
        </span>
        <Button size="sm" tone="neutral" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

// ─── toasts ──────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  tone: 'success' | 'error' | 'info';
  message: string;
}

const ToastContext = createContext<{ push: (tone: Toast['tone'], message: string) => void }>({
  push: () => {},
});

/** Every completed action confirms itself — silence reads as failure. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 8000 : 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[1000] flex flex-col gap-2 w-[340px]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12px] shadow-lg ${
              t.tone === 'success'
                ? 'bg-white border-emerald-200 text-[#0a5c43]'
                : t.tone === 'error'
                  ? 'bg-white border-red-200 text-red-800'
                  : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {t.tone === 'success' ? <Check size={15} className="mt-px shrink-0" /> : null}
            {t.tone === 'error' ? <AlertTriangle size={15} className="mt-px shrink-0" /> : null}
            {t.tone === 'info' ? <Info size={15} className="mt-px shrink-0" /> : null}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── modal shell ─────────────────────────────────────────────────────────────

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus lands inside the dialog so keyboard users are not left on the page behind it.
    const first = ref.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([aria-label="Close"])'
    );
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[900] flex items-start justify-center bg-slate-900/50 p-4 pt-[8vh] overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${width} rounded-xl bg-white shadow-2xl border border-slate-200`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>
            {subtitle ? <div className="text-[12px] text-slate-500 mt-0.5">{subtitle}</div> : null}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 p-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ─── copy-to-clipboard ───────────────────────────────────────────────────────

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — the value is on screen anyway */
        }
      }}
      className="text-[11px] font-semibold text-slate-500 hover:text-[#0b6e4f] underline underline-offset-2"
    >
      {done ? 'Copied' : label}
    </button>
  );
}
