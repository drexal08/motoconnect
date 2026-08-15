/**
 * Ops-console API client.
 *
 * Separate from the consumer app's client on purpose: a different token key
 * (so a consumer session can never be mistaken for an admin one), and no
 * "remember me" persistence beyond the tab — §2.3 rules that out for this
 * surface. sessionStorage means closing the tab ends the session locally, while
 * the server-side idle and absolute timeouts remain the real controls.
 */

import { apiUrl } from '../config';

const TOKEN_KEY = 'motoconnect.ops.token';

export function getAdminToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export class OpsApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Session-ending codes the shell reacts to by bouncing back to sign-in. */
export const SESSION_DEAD_CODES = ['ADMIN_UNAUTHORIZED', 'ADMIN_SESSION_EXPIRED', 'ADMIN_SUSPENDED'];

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Set false for the sign-in and setup calls, which have no session yet. */
  auth?: boolean;
  /** Override the bearer token (used by the half-authenticated 2FA step). */
  token?: string;
  signal?: AbortSignal;
}

export async function opsApi<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const token = opts.token ?? (opts.auth === false ? null : getAdminToken());
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/admin${path}`), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new OpsApiError(0, 'Cannot reach the API. Check that the server is running.');
  }

  // CSV exports come back as text, not JSON.
  const contentType = res.headers.get('content-type') ?? '';
  if (res.ok && contentType.includes('text/csv')) {
    return (await res.text()) as unknown as T;
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const code = typeof data.code === 'string' ? data.code : undefined;
    if (code && SESSION_DEAD_CODES.includes(code)) {
      clearAdminToken();
      window.dispatchEvent(new CustomEvent('ops:session-ended', { detail: { code } }));
    }
    throw new OpsApiError(
      res.status,
      typeof data.error === 'string' ? data.error : 'Something went wrong. Try again.',
      code
    );
  }

  return data as T;
}

/** Builds a querystring, skipping empty values so URLs stay readable. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
