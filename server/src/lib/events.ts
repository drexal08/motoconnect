/** Tiny pub-sub so services can notify the Socket.IO layer without circular imports. */
type Handler = (payload: any) => void;

const handlers = new Map<string, Set<Handler>>();

export function on(event: string, handler: Handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event)!.add(handler);
}

export function emit(event: string, payload: unknown) {
  handlers.get(event)?.forEach((h) => {
    try {
      h(payload);
    } catch (err) {
      console.error(`event handler error for ${event}:`, err);
    }
  });
}

/** A request's state changed (or a rider/passenger needs a fresh pool push). */
export const REQUEST_EVENT = 'request:event';
/** Location of a user changed (throttled broadcasting handled by the WS layer). */
export const LOCATION_EVENT = 'location:event';
