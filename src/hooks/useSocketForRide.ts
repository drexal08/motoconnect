import { useEffect } from 'react';
import { useSocketStore } from '../store/useSocketStore';
import { useRideStore } from '../store/useRideStore';
import { useAuthStore } from '../store/useAuthStore';
import { useLocationStore } from '../store/useLocationStore';

/**
 * Wires the WebSocket layer into the app:
 *  - connects while signed in (reconnects on session restore)
 *  - forwards request:event payloads into the ride state machine
 *  - streams GPS ticks while location sharing is on (riders: pool distance +
 *    post-confirm tracking; passengers: nothing is sent server-side beyond
 *    their own request pickup)
 */
export function useSocketForRide() {
  const user = useAuthStore((s) => s.user);
  const connect = useSocketStore((s) => s.connect);
  const disconnect = useSocketStore((s) => s.disconnect);
  const sendLocation = useSocketStore((s) => s.sendLocation);
  const location = useLocationStore();
  const applyEvent = useRideStore((s) => s.applyEvent);

  useEffect(() => {
    if (user) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [user, connect, disconnect]);

  // Lifecycle events → ride store.
  useEffect(() => {
    const unsub = useSocketStore.subscribe((state, prev) => {
      const evs = state.requestEvents;
      const prevEvs = prev.requestEvents;
      if (evs.length === prevEvs.length) return;
      const fresh = evs.slice(prevEvs.length);
      for (const ev of fresh) {
        applyEvent(ev.id, ev.status, ev.rider ?? undefined);
      }
    });
    return unsub;
  }, [applyEvent]);

  // GPS ticks → socket (throttled by the server, ~1/2 s post-confirm).
  useEffect(() => {
    if (!user || !location.position || !location.watching) return;
    const tick = () => {
      if (location.position) {
        sendLocation(location.position.lat, location.position.lng, location.position.heading, location.position.speed);
      }
    };
    tick();
    const t = setInterval(tick, 3_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.watching, sendLocation]);
}
