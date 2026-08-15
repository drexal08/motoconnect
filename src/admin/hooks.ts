/** Data-fetching helpers for the ops console. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { OpsApiError, opsApi } from './api';

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only for the first load, so a poll refresh never blanks the screen. */
  initialLoading: boolean;
  reload: () => void;
}

/**
 * Fetches `path` and re-fetches whenever it changes. An optional poll interval
 * keeps live screens current; refreshes update in place rather than swapping the
 * table for a spinner, which would make rows jump under the operator's cursor.
 */
export function useQuery<T>(path: string | null, opts: { pollMs?: number; enabled?: boolean } = {}): QueryState<T> {
  const { pollMs, enabled = true } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const loadedPath = useRef<string | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!path || !enabled) {
      setInitialLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    // A different endpoint means genuinely new content — show the loading state.
    if (loadedPath.current !== path) {
      setInitialLoading(true);
      setData(null);
    }

    setLoading(true);
    opsApi<T>(path, { signal: controller.signal })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        loadedPath.current = path;
      })
      .catch((err) => {
        if (cancelled || err?.name === 'AbortError') return;
        setError(err instanceof OpsApiError ? err.message : 'Could not load this view.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setInitialLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [path, enabled, nonce]);

  // Polling for the live screens. Paused while the tab is hidden — nobody is
  // reading it, and it is pointless load on the API.
  useEffect(() => {
    if (!pollMs || !path || !enabled) return;
    const tick = () => {
      if (document.visibilityState === 'visible') reload();
    };
    const id = setInterval(tick, pollMs);
    return () => clearInterval(id);
  }, [pollMs, path, enabled, reload]);

  return { data, error, loading, initialLoading, reload };
}

/** Debounces a value — used for search boxes so every keystroke is not a query. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** Re-renders on an interval so relative ages ("4m ago") do not go stale. */
export function useTicker(ms = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}
