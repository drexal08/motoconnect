import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { getToken } from '../api/client';
import type { PoolItem, RequestEventPayload } from '../api/types';

/**
 * Realtime slice (PRD §8.1): Zustand + selectors, not Context — the pool
 * updates on a 5 s heartbeat and GPS ticks arrive at high frequency.
 */
interface SocketState {
  connected: boolean;
  pool: PoolItem[];
  poolKnown: boolean;
  riderLocation: { lat: number; lng: number; heading: number; speed: number; at: string } | null;
  requestEvents: RequestEventPayload[]; // recent lifecycle events (ring buffer)
  connect: () => void;
  disconnect: () => void;
  sendLocation: (lat: number, lng: number, heading?: number, speed?: number) => void;
  clearEvents: () => void;
}

let socket: Socket | null = null;

export const useSocketStore = create<SocketState>((set) => ({
  connected: false,
  pool: [],
  poolKnown: false,
  riderLocation: null,
  requestEvents: [],

  connect: () => {
    if (socket) return;
    const token = getToken();
    if (!token) return;

    socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('pool:update', (data: { pool: PoolItem[]; locationKnown: boolean }) => {
      set({ pool: data.pool, poolKnown: data.locationKnown });
    });

    socket.on('rider:location', (loc: { lat: number; lng: number; heading: number; speed: number; at: string }) => {
      set({ riderLocation: loc });
    });

    socket.on('request:event', (ev: RequestEventPayload) => {
      set((s) => ({ requestEvents: [...s.requestEvents.slice(-9), ev] }));
    });
  },

  disconnect: () => {
    socket?.disconnect();
    socket = null;
    set({ connected: false });
  },

  sendLocation: (lat, lng, heading, speed) => {
    if (!socket?.connected) return;
    socket.emit('location:tick', { lat, lng, heading, speed });
  },

  clearEvents: () => set({ requestEvents: [] }),
}));
