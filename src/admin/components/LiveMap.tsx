/**
 * Live-ops map (admin spec §5.1).
 *
 * Built on Leaflet + OpenStreetMap rather than the consumer app's Google Maps
 * loader, for one blunt reason: it needs no API key, so the ops map is never a
 * grey box because a billing account lapsed or an env var was missed on the
 * ops host. Exact coordinates, colour-coded by ride state, click a marker to
 * open the ride.
 */
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { RIDE_STATUS_COLOR } from './ui';

/** Kigali city centre — the fallback view when nothing is in flight. */
const KIGALI: [number, number] = [-1.9441, 30.0619];

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  kind: 'pickup' | 'rider';
  status: string;
  label: string;
  detail?: string;
}

export interface MapTrail {
  id: string;
  points: [number, number][];
  color?: string;
}

function markerIcon(point: MapPoint): L.DivIcon {
  const color = RIDE_STATUS_COLOR[point.status] ?? '#64748b';
  const isRider = point.kind === 'rider';
  // A rider is a filled square with a white core; a pickup is a ring. Shape
  // carries the meaning as well as colour, so the map still reads correctly
  // for anyone who cannot separate the hues.
  const html = isRider
    ? `<span style="display:block;width:14px;height:14px;background:${color};border:2.5px solid #fff;
         box-shadow:0 0 0 1px rgba(15,23,42,.35);border-radius:3px"></span>`
    : `<span style="display:block;width:14px;height:14px;background:#fff;border:3.5px solid ${color};
         box-shadow:0 0 0 1px rgba(15,23,42,.25);border-radius:50%"></span>`;
  return L.divIcon({
    className: '',
    html,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function LiveMap({
  points,
  trails = [],
  height = '520px',
  selectedId,
  onSelect,
  autoFit = true,
}: {
  points: MapPoint[];
  trails?: MapTrail[];
  height?: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  autoFit?: boolean;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Boot the map once. Cleanup is explicit — Leaflet leaks handlers otherwise.
  useEffect(() => {
    if (!divRef.current || mapRef.current) return;
    const map = L.map(divRef.current, {
      center: KIGALI,
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  // Leaflet measures the container on creation; if the panel was hidden or the
  // window resized, it needs telling. Cheap and prevents a half-rendered map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const invalidate = () => map.invalidateSize();
    const t = setTimeout(invalidate, 60);
    window.addEventListener('resize', invalidate);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', invalidate);
    };
  }, [height]);

  // Serialise the inputs so we only redraw when something actually moved.
  const pointsKey = useMemo(
    () => points.map((p) => `${p.id}:${p.lat.toFixed(5)}:${p.lng.toFixed(5)}:${p.status}`).join('|'),
    [points]
  );
  const trailsKey = useMemo(() => trails.map((t) => `${t.id}:${t.points.length}`).join('|'), [trails]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    for (const trail of trails) {
      if (trail.points.length < 2) continue;
      L.polyline(trail.points, {
        color: trail.color ?? '#0b6e4f',
        weight: 2.5,
        opacity: 0.65,
        dashArray: '4 4',
      }).addTo(layer);
    }

    for (const p of points) {
      const marker = L.marker([p.lat, p.lng], {
        icon: markerIcon(p),
        title: p.label,
        riseOnHover: true,
      }).addTo(layer);

      marker.bindTooltip(p.label, {
        className: 'ops-marker-label',
        direction: 'top',
        offset: [0, -10],
        permanent: p.id === selectedId,
      });
      if (p.detail) {
        marker.bindPopup(
          `<div style="font-size:12px;line-height:1.5"><strong>${escapeHtml(p.label)}</strong><br/>${escapeHtml(p.detail)}</div>`
        );
      }
      marker.on('click', () => onSelectRef.current?.(p.id));
    }

    // Fit once on first data so the operator is not left staring at an empty
    // ocean — but never yank the view out from under them afterwards.
    if (autoFit && !fittedRef.current && points.length) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 15 });
      fittedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey, trailsKey, selectedId, autoFit]);

  // Centre on an explicitly selected ride.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const target = points.find((p) => p.id === selectedId);
    if (target) map.panTo([target.lat, target.lng]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200" style={{ height }}>
      <div ref={divRef} className="w-full h-full" />
      {points.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/85 pointer-events-none">
          <p className="text-[13px] font-medium text-slate-600">No rides in flight right now.</p>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

/** Shared legend so the map's colour coding is never a guess. */
export function MapLegend() {
  const entries: { label: string; status: string }[] = [
    { label: 'Claimed', status: 'CLAIMED' },
    { label: 'Confirmed', status: 'CONFIRMED' },
    { label: 'En route', status: 'EN_ROUTE' },
    { label: 'Arrived', status: 'ARRIVED' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-600">
      {entries.map((e) => (
        <span key={e.status} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full"
            style={{ background: RIDE_STATUS_COLOR[e.status] }}
          />
          {e.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 pl-2 border-l border-slate-200">
        <span className="inline-block w-2.5 h-2.5 rounded-full border-[3px] border-slate-400 bg-white" />
        Pickup pin
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-slate-500" />
        Rider position
      </span>
    </div>
  );
}
