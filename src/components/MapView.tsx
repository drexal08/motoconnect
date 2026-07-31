import { useEffect, useRef, type ReactNode } from 'react';
import { hasMapsKey, useGoogleMaps } from '../hooks/useGoogleMaps';
import { MapPinOff } from 'lucide-react';
import { EmptyState } from './ui';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  /** Custom marker color (e.g. rider vs passenger). */
  tone?: 'passenger' | 'rider' | 'pickup';
  pulse?: boolean;
}

interface MapViewProps {
  center?: { lat: number; lng: number } | null;
  zoom?: number;
  markers?: MapMarker[];
  myLocation?: { lat: number; lng: number } | null;
  showMyLocation?: boolean;
  height?: string;
  interactive?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  onMapClick?: (pos: { lat: number; lng: number }) => void;
  onEmptyKey?: () => ReactNode;
}

const KIGALI = { lat: -1.9441, lng: 30.0619 };

const MARKER_COLORS: Record<NonNullable<MapMarker['tone']>, { fill: string; stroke: string }> = {
  passenger: { fill: '#0b6e4f', stroke: '#ffffff' },
  rider: { fill: '#f5a623', stroke: '#1f2421' },
  pickup: { fill: '#c43d2f', stroke: '#ffffff' },
};

/**
 * Google Maps-backed map. No API key → designed empty state (never a broken
 * placeholder with fake data, §7.4). Markers update in place without full
 * re-renders so GPS-tick tracking stays smooth.
 */
export default function MapView({
  center = null,
  zoom = 14,
  markers = [],
  myLocation = null,
  showMyLocation = true,
  height = '320px',
  interactive = true,
  onMarkerClick,
  onMapClick,
  onEmptyKey,
}: MapViewProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const myMarkerRef = useRef<google.maps.Marker | null>(null);
  const { loaded } = useGoogleMaps();
  const onMarkerClickRef = useRef(onMarkerClick);
  onMarkerClickRef.current = onMarkerClick;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Boot the map once.
  useEffect(() => {
    if (!loaded || !divRef.current || mapRef.current) return;
    const map = new google.maps.Map(divRef.current, {
      center: center ?? KIGALI,
      zoom,
      disableDefaultUI: !interactive,
      zoomControl: interactive,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
    });
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      const pos = e.latLng;
      if (pos) onMapClickRef.current?.({ lat: pos.lat(), lng: pos.lng() });
    });
    mapRef.current = map;
    return () => {
      mapRef.current = null;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current.clear();
      myMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // My-location marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showMyLocation) return;
    if (myLocation) {
      if (!myMarkerRef.current) {
        myMarkerRef.current = new google.maps.Marker({
          position: myLocation,
          map,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#1f2421',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          zIndex: 99,
          title: 'You',
        });
      } else {
        myMarkerRef.current.setPosition(myLocation);
      }
    } else if (myMarkerRef.current) {
      myMarkerRef.current.setMap(null);
      myMarkerRef.current = null;
    }
  }, [myLocation, showMyLocation]);

  // Pool/ride markers — create/update/remove in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      let g = markersRef.current.get(m.id);
      const colors = MARKER_COLORS[m.tone ?? 'passenger'];
      const icon = {
        path: google.maps.SymbolPath.CIRCLE,
        scale: m.tone === 'rider' ? 11 : 9,
        fillColor: colors.fill,
        fillOpacity: 1,
        strokeColor: colors.stroke,
        strokeWeight: 3,
      };
      if (!g) {
        g = new google.maps.Marker({
          position: m,
          map,
          icon,
          title: m.label,
          zIndex: m.tone === 'rider' ? 100 : 10,
        });
        g.addListener('click', () => onMarkerClickRef.current?.(m));
        markersRef.current.set(m.id, g);
      } else {
        g.setPosition(m);
        g.setIcon(icon);
        g.setTitle(m.label);
      }
      if (m.pulse) {
        // cheap pulse: alternate scale via icon
        g.setIcon({ ...icon, scale: (icon.scale ?? 9) + 3 });
      }
    }
    for (const [id, g] of markersRef.current) {
      if (!seen.has(id)) {
        g.setMap(null);
        markersRef.current.delete(id);
      }
    }
  }, [markers]);

  // Follow a center (rider tracking), but let the user pan away.
  useEffect(() => {
    const map = mapRef.current;
    if (map && center && interactive) map.panTo(center);
  }, [center, interactive]);

  if (!hasMapsKey() || !loaded) {
    const custom = onEmptyKey ? onEmptyKey() : null;
    return (
      <div className="relative w-full rounded-2xl overflow-hidden bg-surface border border-border" style={{ height }}>
        {custom ?? (
          <EmptyState
            icon={<MapPinOff size={26} />}
            title="Map not available"
            body="Add your Google Maps key to VITE_GOOGLE_MAPS_API_KEY in .env.local to see the live map."
          />
        )}
      </div>
    );
  }

  return <div ref={divRef} className="w-full h-full rounded-2xl overflow-hidden" style={{ height }} />;
}
