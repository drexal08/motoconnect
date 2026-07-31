import { create } from 'zustand';
import { api } from '../api/client';

interface LocationState {
  granted: boolean;          // user consented (server-side state)
  watching: boolean;         // GPS watch active
  position: { lat: number; lng: number; accuracyM: number; heading: number; speed: number } | null;
  error: string | null;
  grantConsent: () => Promise<boolean>;
  revokeConsent: () => Promise<void>;
  startWatching: () => void;
  stopWatching: () => void;
}

let watchId: number | null = null;

export const useLocationStore = create<LocationState>((set, get) => ({
  granted: false,
  watching: false,
  position: null,
  error: null,

  grantConsent: async () => {
    try {
      await api('/api/consent/grant', { method: 'POST', body: {} });
      set({ granted: true, error: null });
      return true;
    } catch {
      set({ error: 'We could not save your choice. Try again.' });
      return false;
    }
  },

  revokeConsent: async () => {
    try {
      await api('/api/consent/revoke', { method: 'POST', body: {} });
      set({ granted: false });
      get().stopWatching();
    } catch {
      set({ error: 'We could not turn off location sharing. Try again.' });
    }
  },

  startWatching: () => {
    if (watchId !== null) return;
    if (!('geolocation' in navigator)) {
      set({ error: 'This browser does not support location sharing.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set({
          position: {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracyM: p.coords.accuracy,
            heading: p.coords.heading ?? 0,
            speed: p.coords.speed ?? 0,
          },
          watching: true,
          error: null,
        });
      },
      (err) => {
        set({
          error:
            err.code === err.PERMISSION_DENIED
              ? 'Location access is blocked. Allow location for MotoConnect in your browser settings.'
              : 'We could not get your location. Check GPS and try again.',
          watching: false,
        });
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        set({
          position: {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracyM: p.coords.accuracy,
            heading: p.coords.heading ?? 0,
            speed: p.coords.speed ?? 0,
          },
          watching: true,
          error: null,
        });
      },
      () => set({ watching: false }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 2_000 }
    );
  },

  stopWatching: () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    set({ watching: false });
  },
}));
