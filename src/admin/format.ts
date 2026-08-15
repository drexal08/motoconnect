/** Formatting helpers for the ops console. Dense, unambiguous, no cleverness. */

const dateTime = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeOnly = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const dateOnly = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateOnly.format(d);
}

export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : timeOnly.format(d);
}

/** Compact relative age: 4m, 3h, 2d. Used where the delta matters more than the clock. */
export function fmtAge(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86400)}d`;
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** RWF has no minor unit in everyday use — never show decimals. */
export function fmtRwf(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${Math.round(amount).toLocaleString('en-US')} RWF`;
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('en-US');
}

export function fmtPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined) return '—';
  return `${Math.round(fraction * 100)}%`;
}

/** Turns snake_case action codes into readable labels without a lookup table. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function shortId(id: string | null | undefined, chars = 8): string {
  if (!id) return '—';
  return id.length <= chars ? id : `${id.slice(0, chars)}…`;
}
