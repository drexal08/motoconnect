import { JITTER_MIN_M, JITTER_MAX_M } from '../config.js';

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface LatLng {
  lat: number;
  lng: number;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const la = a.lat * DEG_TO_RAD;
  const lb = b.lat * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass direction (8-point) from a to b. */
export function bearing8(a: LatLng, b: LatLng): string {
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const la = a.lat * DEG_TO_RAD;
  const lb = b.lat * DEG_TO_RAD;
  const y = Math.sin(dLng) * Math.cos(lb);
  const x = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][idx];
}

/** Distance band rounded to the nearest 100 m ("~400 m away"). */
export function distanceBand(m: number): number {
  return Math.max(100, Math.round(m / 100) * 100);
}

/**
 * Random offset of 150-200 m at a random bearing. Picked ONCE per ride request
 * at creation and reused, so repeated observations cannot be triangulated back
 * to the exact pickup point (PRD §3.2).
 */
export function generateJitter(): { dlat: number; dlng: number } {
  const dist = JITTER_MIN_M + Math.random() * (JITTER_MAX_M - JITTER_MIN_M);
  const bearing = Math.random() * 360;
  const rad = bearing * DEG_TO_RAD;
  const dlat = (Math.cos(rad) * dist) / 111_320;
  const dlng = (Math.sin(rad) * dist) / (111_320 * 0.99); // cos(lat)≈0.99 for Kigali lat
  return { dlat, dlng };
}

/** Anonymized marker position for a ride request. */
export function jitteredPoint(pickup: LatLng, jitter: { dlat: number; dlng: number }): LatLng {
  return { lat: pickup.lat + jitter.dlat, lng: pickup.lng + jitter.dlng };
}
