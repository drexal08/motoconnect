import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { cn } from '../lib/cn';

/* ─── Button ─────────────────────────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900 shadow-sm shadow-emerald-950/10',
  secondary:
    'bg-amber-500 text-ink font-semibold hover:bg-amber-600 active:bg-amber-700 shadow-sm shadow-amber-950/10',
  ghost: 'bg-transparent text-emerald-800 hover:bg-emerald-50',
  danger: 'bg-destructive text-white hover:bg-red-800',
  outline: 'border-2 border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400',
};

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-emerald-600',
        buttonVariants[variant],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

/* ─── Inputs (all ≥16px per §7.1 — prevents mobile zoom-on-focus) ────────── */
export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-input bg-white px-4 py-3 text-base text-ink placeholder:text-ink/35',
        'focus:outline-2 focus:outline-emerald-600 focus:border-emerald-600 transition',
        className
      )}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-input bg-white px-4 py-3 text-base text-ink placeholder:text-ink/35',
        'focus:outline-2 focus:outline-emerald-600 focus:border-emerald-600 transition',
        className
      )}
      {...rest}
    />
  );
}

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink/50">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}

/* ─── Modal (in-app, never browser alert/confirm — §7.4) ─────────────────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-ink/50 animate-fade-in"
        onClick={() => dismissible && onClose()}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          {title ? <h2 className="text-lg font-bold text-ink">{title}</h2> : <span />}
          {dismissible && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-2 rounded-full hover:bg-surface transition-colors text-ink/60"
            >
              <X size={20} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ─── Loading / skeleton / empty states (§7.4 — three mandatory variants) ── */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-ink/60">
      <Loader2 size={22} className="animate-spin text-emerald-700" />
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-shimmer rounded-xl', className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-700 mb-4">
        {icon}
      </div>
      <h3 className="font-bold text-ink text-base mb-1">{title}</h3>
      {body && <p className="text-sm text-ink/55 max-w-xs mb-4">{body}</p>}
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'emerald' | 'amber' | 'red';
}) {
  const tones = {
    neutral: 'bg-surface text-ink/60 border border-border',
    emerald: 'bg-emerald-50 text-emerald-800 border border-emerald-100',
    amber: 'bg-amber-50 text-amber-800 border border-amber-100',
    red: 'bg-red-50 text-red-700 border border-red-100',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold', tones[tone])}>
      {children}
    </span>
  );
}

/* ─── Countdown ring (claim/confirm windows, §9.5) ───────────────────────── */
export function CountdownRing({ seconds, total, label }: { seconds: number; total: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (seconds / Math.max(total, 1)) * 100));
  const urgent = seconds <= 10;
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 48 48" className="w-12 h-12 -rotate-90">
          <circle cx="24" cy="24" r="20" fill="none" stroke="#e5e6e2" strokeWidth="4" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={urgent ? '#c43d2f' : '#0b6e4f'}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * 125.6} 125.6`}
            className="transition-all duration-300"
          />
        </svg>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center text-sm font-bold',
            urgent ? 'text-red-700' : 'text-emerald-800'
          )}
        >
          {Math.max(0, Math.ceil(seconds))}
        </span>
      </div>
      {label && (
        <div>
          <p className="text-sm font-semibold text-ink">{label}</p>
          {urgent && <p className="text-xs font-medium text-red-700">Act fast — this is about to expire.</p>}
        </div>
      )}
    </div>
  );
}
