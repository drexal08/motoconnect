import { create } from 'zustand';

export interface LocationParams {
  lat: number;
  lng: number;
  speed: number; // km/h
  heading: number; // degrees
  status: 'idle' | 'moving' | 'paused';
  lastUpdated: number; // timestamp
}

interface LocationState {
  params: LocationParams;
  permissionGranted: boolean;
  isSharing: boolean;
  update: (patch: Partial<LocationParams>) => void;
  grantPermission: () => void;
  startSharing: () => void;
  stopSharing: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  params: {
    lat: -1.9403,
    lng: 29.8739,
    speed: 0,
    heading: 0,
    status: 'idle',
    lastUpdated: Date.now(),
  },
  permissionGranted: false,
  isSharing: false,
  update: (patch) =>
    set({ params: { ...get().params, ...patch, lastUpdated: Date.now() } }),
  grantPermission: () => set({ permissionGranted: true }),
  startSharing: () => set({ isSharing: true, params: { ...get().params, status: 'moving' } }),
  stopSharing: () => set({ isSharing: false, params: { ...get().params, status: 'paused' } }),
}));
