import { create } from 'zustand';
import { api } from '../api/client';
import type { ActiveRequest, RequestStatus } from '../api/types';

/**
 * Ride lifecycle state (passenger + rider views). The server is the source of
 * truth; WS request:event payloads drive transitions here, REST calls issue
 * the actions. Every transition also fires a state change both parties see.
 */
interface RideState {
  active: ActiveRequest | null;
  unrated: { id: string; completedAt: string; otherName: string } | null;
  loading: boolean;
  error: string | null;
  lastAction: 'create' | 'claim' | 'confirm' | 'cancel' | 'rate' | 'status' | null;

  refresh: () => Promise<void>;
  create: (pickup: { lat: number; lng: number }, opts?: { destinationNote?: string; accuracyM?: number }) => Promise<void>;
  claim: (requestId: string) => Promise<void>;
  confirm: (requestId: string) => Promise<void>;
  cancelAsPassenger: (requestId: string, reason?: string) => Promise<string | null>;
  riderAction: (requestId: string, action: 'enroute' | 'arrived' | 'no_show' | 'complete' | 'cancel') => Promise<void>;
  rate: (requestId: string, stars: number, comment?: string) => Promise<void>;
  applyEvent: (id: string, status: RequestStatus, rider?: ActiveRequest['rider']) => void;
  clear: () => void;
}

export const useRideStore = create<RideState>((set, get) => ({
  active: null,
  unrated: null,
  loading: false,
  error: null,
  lastAction: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api<{ active: ActiveRequest | null; unrated: RideState['unrated'] }>('/api/requests/active');
      set({ active: data.active, unrated: data.unrated, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Could not load your ride.' });
    }
  },

  create: async (pickup, opts) => {
    set({ error: null, loading: true, lastAction: 'create' });
    try {
      await api<{ id: string }>('/api/requests', {
        method: 'POST',
        body: { pickup, destinationNote: opts?.destinationNote, accuracyM: opts?.accuracyM },
      });
      set({ lastAction: null, loading: false });
      await get().refresh();
    } catch (e) {
      set({ lastAction: null, loading: false, error: e instanceof Error ? e.message : 'Could not create the request.' });
      throw e;
    }
  },

  claim: async (requestId) => {
    set({ error: null, loading: true, lastAction: 'claim' });
    try {
      await api('/api/requests/' + requestId + '/claim', { method: 'POST', body: {} });
      set({ loading: false, lastAction: null });
      await get().refresh();
    } catch (e) {
      set({ loading: false, lastAction: null, error: e instanceof Error ? e.message : 'Could not claim this request.' });
      throw e;
    }
  },

  confirm: async (requestId) => {
    set({ error: null, loading: true, lastAction: 'confirm' });
    try {
      await api('/api/requests/' + requestId + '/confirm', { method: 'POST', body: {} });
      set({ loading: false, lastAction: null });
      await get().refresh();
    } catch (e) {
      set({ loading: false, lastAction: null, error: e instanceof Error ? e.message : 'Could not confirm the rider.' });
      throw e;
    }
  },

  cancelAsPassenger: async (requestId, reason) => {
    set({ error: null, loading: true, lastAction: 'cancel' });
    try {
      const data = await api<{ status: string; warning: string | null }>('/api/requests/' + requestId, {
        method: 'DELETE',
        body: { reason },
      });
      set({ loading: false, lastAction: null });
      await get().refresh();
      return data.warning;
    } catch (e) {
      set({ loading: false, lastAction: null, error: e instanceof Error ? e.message : 'Could not cancel the ride.' });
      throw e;
    }
  },

  riderAction: async (requestId, action) => {
    set({ error: null, loading: true, lastAction: 'status' });
    try {
      await api('/api/requests/' + requestId + '/action', { method: 'POST', body: { action } });
      set({ loading: false, lastAction: null });
      await get().refresh();
    } catch (e) {
      set({ loading: false, lastAction: null, error: e instanceof Error ? e.message : 'Action failed. Try again.' });
      throw e;
    }
  },

  rate: async (requestId, stars, comment) => {
    set({ error: null, loading: true, lastAction: 'rate' });
    try {
      await api('/api/requests/' + requestId + '/rate', { method: 'POST', body: { stars, comment } });
      set({ loading: false, lastAction: null, unrated: null });
    } catch (e) {
      set({ loading: false, lastAction: null, error: e instanceof Error ? e.message : 'Could not save your rating.' });
      throw e;
    }
  },

  applyEvent: (id, status, rider) => {
    const cur = get().active;
    if (!cur || cur.id !== id) return;
    const next: ActiveRequest = { ...cur, status };
    if (rider) next.rider = rider;
    if (status === 'CONFIRMED') next.confirmDeadline = null;
    set({ active: next });
    // Terminal states: refresh from the server so unrated rides surface.
    if (['COMPLETED', 'NO_SHOW', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_RIDER', 'EXPIRED_UNCLAIMED'].includes(status)) {
      setTimeout(() => get().refresh(), 400);
    }
  },

  clear: () => set({ active: null, unrated: null, error: null }),
}));
