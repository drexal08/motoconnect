/**
 * WebSocket layer (§8.2):
 *  - riders get pool pushes while online (heartbeat every 5 s).
 *  - request lifecycle events are routed ONLY to the two rooms involved
 *    (user:<passengerId> and user:<claimedBy>) — no global broadcasts.
 *  - after CONFIRMED, rider location ticks are forwarded to the passenger
 *    (throttled to ~1 per 2 s) — the "where is my ride" view.
 *  - riders in the pool space get stripped pool notices (id + status only).
 */
import type { Server } from 'socket.io';
import { verifyToken, type TokenPayload } from '../lib/jwt.js';
import { on, REQUEST_EVENT } from '../lib/events.js';
import { getPoolForRider } from '../services/requestService.js';
import { pool } from '../db/pool.js';

const LOCATION_TICK_MS = 2_000;
const HEARTBEAT_MS = 5_000;

interface SocketState {
  userId: string;
  user: TokenPayload;
  socketId: string;
  lastTickAt: number;
}

const states = new Map<string, SocketState>(); // userId -> state

export function setupSocket(io: Server) {
  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? '';
    const payload = verifyToken(token);
    if (!payload) return next(new Error('unauthorized'));
    socket.data.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as TokenPayload;
    states.set(user.uid, { userId: user.uid, user, socketId: socket.id, lastTickAt: 0 });
    socket.join(`user:${user.uid}`);
    console.log(`[ws] ${user.role} ${user.uid} connected`);

    if (user.role === 'rider') {
      socket.join('riders');
      pushPoolFor(io, user.uid).catch((err) => console.error('[ws] pool push:', err.message));
    }

    socket.on('location:tick', (data: { lat?: number; lng?: number; heading?: number; speed?: number }) => {
      if (typeof data.lat !== 'number' || typeof data.lng !== 'number') return;
      handleLocationTick(io, user.uid, {
        lat: data.lat,
        lng: data.lng,
        heading: data.heading,
        speed: data.speed,
      }).catch((err) => console.error('[ws] location:', err.message));
    });

    socket.on('disconnect', () => {
      states.delete(user.uid);
    });
  });

  on(REQUEST_EVENT, (ev: RequestEvent) => routeRequestEvent(io, ev));

  setInterval(() => pushAllPools(io).catch(() => { /* transient */ }), HEARTBEAT_MS);
}

type RequestEvent = {
  id: string;
  status: string;
  passengerId?: string | null;
  claimedBy?: string | null;
  reason?: string;
  rider?: { id: string; name: string | null; plate: string | null; rating: number | null };
  pickupExact?: { lat: number; lng: number } | null;
  passengerName?: string | null;
};

async function routeRequestEvent(io: Server, ev: RequestEvent) {
  // Resolve the passenger room (event payloads carry it when known).
  let passengerId = ev.passengerId;
  if (!passengerId && ev.status === 'VISIBLE' && ev.reason === 'claim-expired') {
    passengerId = await pool
      .query(`SELECT passenger_id FROM ride_requests WHERE id = $1`, [ev.id])
      .then((r) => r.rows[0]?.passenger_id ?? null);
  }
  const claimedBy = ev.claimedBy;

  // 1. Passenger room gets the full event.
  if (passengerId) {
    const payload: Record<string, unknown> = {
      id: ev.id,
      status: ev.status,
      rider: ev.rider ?? null,
      passengerName: ev.passengerName ?? null,
      at: new Date().toISOString(),
    };
    if (ev.status === 'CONFIRMED' && ev.pickupExact) {
      // §3.2 step 4: the passenger sees the confirming rider; the rider gets
      // the exact pickup in their own event below.
      io.to(`user:${passengerId}`).emit('request:event', payload);
    } else {
      io.to(`user:${passengerId}`).emit('request:event', payload);
    }
  }

  // 2. Claiming rider room: full event + exact pickup once CONFIRMED.
  if (claimedBy) {
    const payload: Record<string, unknown> = {
      id: ev.id,
      status: ev.status,
      passengerName: ev.passengerName ?? null,
      at: new Date().toISOString(),
    };
    if (ev.status === 'CONFIRMED' && ev.pickupExact) {
      payload.pickup = ev.pickupExact; // exact coordinates revealed here only
    }
    io.to(`user:${claimedBy}`).emit('request:event', payload);
  }

  // 3. Pool space gets a stripped notice (id + status) for bookkeeping.
  const poolRelevant = ['VISIBLE', 'CLAIMED', 'EXPIRED_UNCLAIMED', 'CANCELLED_BY_PASSENGER', 'NO_SHOW'].includes(
    ev.status
  );
  if (poolRelevant) {
    io.to('riders').emit('pool:notice', { id: ev.id, status: ev.status, at: new Date().toISOString() });
  }

  // 4. Pool changed → refresh all riders' anonymized pools.
  if (poolRelevant) pushAllPools(io).catch(() => { /* best effort */ });
}

async function handleLocationTick(io: Server, userId: string, tick: { lat: number; lng: number; heading?: number; speed?: number }) {  const state = states.get(userId);
  if (!state) return;

  await pool.query(
    `INSERT INTO user_locations (user_id, last_lat, last_lng, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET last_lat = EXCLUDED.last_lat, last_lng = EXCLUDED.last_lng, updated_at = now()`,
    [userId, tick.lat, tick.lng]
  );

  const now = Date.now();
  if (now - state.lastTickAt < LOCATION_TICK_MS) return;
  state.lastTickAt = now;

  // Admin spec §5.1 — breadcrumb trail for the live-ops map and for reviewing a
  // fresh dispute. Short retention, pruned by the sweeper; this is not an
  // archive of where anyone has been.
  await pool.query(
    `INSERT INTO ride_tracks (ride_request_id, user_id, lat, lng)
     SELECT r.id, $1, $2, $3 FROM ride_requests r
     WHERE (r.claimed_by = $1 OR r.passenger_id = $1)
       AND r.status IN ('CLAIMED','CONFIRMED','EN_ROUTE','ARRIVED')
     LIMIT 1`,
    [userId, tick.lat, tick.lng]
  );

  if (state.user.role === 'rider') {
    const ride = await pool.query(
      `SELECT passenger_id FROM ride_requests
       WHERE claimed_by = $1 AND status IN ('CONFIRMED','EN_ROUTE','ARRIVED') LIMIT 1`,
      [userId]
    );
    if (ride.rows.length) {
      io.to(`user:${ride.rows[0].passenger_id}`).emit('rider:location', {
        lat: tick.lat,
        lng: tick.lng,
        heading: tick.heading ?? 0,
        speed: tick.speed ?? 0,
        at: new Date().toISOString(),
      });
    }
  }
}

async function pushPoolFor(io: Server, riderId: string) {
  const state = states.get(riderId);
  if (!state) return;
  const loc = await pool
    .query(`SELECT last_lat, last_lng FROM user_locations WHERE user_id = $1`, [riderId])
    .then((r) => r.rows[0] ?? null);
  if (!loc) {
    io.to(state.socketId).emit('pool:update', { pool: [], locationKnown: false, now: Date.now() });
    return;
  }
  const items = await getPoolForRider(riderId, { lat: Number(loc.last_lat), lng: Number(loc.last_lng) });
  io.to(state.socketId).emit('pool:update', { pool: items, locationKnown: true, now: Date.now() });
}

async function pushAllPools(io: Server) {
  const riderStates = [...states.values()].filter((s) => s.user.role === 'rider');
  await Promise.allSettled(riderStates.map((s) => pushPoolFor(io, s.userId)));
}
