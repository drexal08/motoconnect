/**
 * Where the API lives.
 *
 * In development this is empty, so every request stays relative and Vite's dev
 * proxy forwards `/api` and `/socket.io` to localhost:4000.
 *
 * In production the front ends are static files on Vercel while the API and its
 * WebSocket run on a persistent host, so requests must be absolute. Vercel
 * rewrites deliberately are NOT used for this: a rewrite cannot proxy a
 * WebSocket upgrade, so the socket would have to point somewhere else anyway —
 * and one base URL for both is easier to reason about than two rules that
 * disagree.
 */
const RAW = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

/** Normalised, no trailing slash. Empty string means "same origin". */
export const API_BASE_URL = RAW.replace(/\/+$/, '');

/** Socket.IO needs an absolute origin; same origin is expressed as '/'. */
export const SOCKET_URL = API_BASE_URL || '/';

/** Builds an API URL from a leading-slash path. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

/**
 * Cross-origin in production means the browser will not attach cookies by
 * default — which is fine, because both apps authenticate with bearer tokens.
 * Stated here so nobody later "fixes" it by turning on credentials.
 */
export const IS_CROSS_ORIGIN = API_BASE_URL.length > 0;
