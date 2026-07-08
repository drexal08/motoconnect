import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGoogleMaps } from '@/hooks/useGoogleMaps';
import { useGeolocation } from '@/hooks/useGeolocation';
import { IconMapPin, IconX, IconPhone, IconClock, IconLocation } from './Icons';

export interface PassengerMarker {
  id: string;
  lat: number;
  lng: number;
  name: string;
  phone: string;
  destination: string;
  timestamp: number;
}

interface MapComponentProps {
  height?: string;
  markers?: PassengerMarker[];
  showMyLocation?: boolean;
  onMarkerClick?: (marker: PassengerMarker) => void;
  interactive?: boolean;
  defaultCenter?: { lat: number; lng: number };
  defaultZoom?: number;
}

const DEFAULT_CENTER = { lat: -1.9441, lng: 30.0619 };
const DEFAULT_ZOOM = 13;

const DEMO_PASSENGERS: PassengerMarker[] = [
  { id: '1', lat: -1.935, lng: 30.08, name: 'Jean Marie', phone: '+250 788 123 456', destination: 'Kigali Heights', timestamp: Date.now() - 300000 },
  { id: '2', lat: -1.955, lng: 30.055, name: 'Claire M.', phone: '+250 789 234 567', destination: 'Nyarutarama', timestamp: Date.now() - 600000 },
  { id: '3', lat: -1.925, lng: 30.07, name: 'Eric N.', phone: '+250 780 345 678', destination: 'Kimihurura', timestamp: Date.now() - 120000 },
  { id: '4', lat: -1.945, lng: 30.09, name: 'Aline K.', phone: '+250 785 456 789', destination: 'Gisozi', timestamp: Date.now() - 450000 },
  { id: '5', lat: -1.96, lng: 30.065, name: 'Patrick H.', phone: '+250 781 567 890', destination: 'Remera', timestamp: Date.now() - 180000 },
  { id: '6', lat: -1.93, lng: 30.045, name: 'Diane U.', phone: '+250 786 678 901', destination: 'Kacyiru', timestamp: Date.now() - 900000 },
];

const MapComponent: React.FC<MapComponentProps> = ({
  height = '500px',
  markers = [],
  showMyLocation = true,
  onMarkerClick,
  interactive = true,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = DEFAULT_ZOOM,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const myLocationMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const { isLoaded, error } = useGoogleMaps({ apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '' });
  const { position, getCurrentPosition } = useGeolocation({ watch: false });
  const [selectedPassenger, setSelectedPassenger] = useState<PassengerMarker | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const allMarkers = markers.length > 0 ? markers : DEMO_PASSENGERS;

  useEffect(() => {
    if (showMyLocation) {
      getCurrentPosition();
    }
  }, [showMyLocation, getCurrentPosition]);

  useEffect(() => {
    if (error) {
      setUseFallback(true);
    }
  }, [error]);

  useEffect(() => {
    if (!isLoaded || !mapRef.current || mapInstanceRef.current) return;

    try {
      const google = window.google;
      if (!google?.maps) {
        setUseFallback(true);
        return;
      }

      const map = new google.maps.Map(mapRef.current, {
        center: position
          ? { lat: position.lat, lng: position.lng }
          : defaultCenter,
        zoom: defaultZoom,
        disableDefaultUI: !interactive,
        zoomControl: interactive,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
        styles: [
          { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
        ],
      });

      mapInstanceRef.current = map;
    } catch {
      setUseFallback(true);
    }
  }, [isLoaded, error, position, defaultCenter, defaultZoom, interactive]);

  useEffect(() => {
    if (!mapInstanceRef.current || !window.google?.maps) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    allMarkers.forEach((marker) => {
      const gMarker = new window.google.maps.Marker({
        position: { lat: marker.lat, lng: marker.lng },
        map: mapInstanceRef.current,
        title: marker.name,
        animation: window.google.maps.Animation.DROP,
      });

      gMarker.addListener('click', () => {
        setSelectedPassenger(marker);
        if (onMarkerClick) onMarkerClick(marker);
      });

      markersRef.current.push(gMarker);
    });
  }, [allMarkers, onMarkerClick, isLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !position || !window.google?.maps) return;

    const google = window.google;
    const map = mapInstanceRef.current;
    const currentPosition = { lat: position.lat, lng: position.lng };

    map.setCenter(currentPosition);

    if (!showMyLocation) {
      if (myLocationMarkerRef.current) {
        myLocationMarkerRef.current.setMap(null);
        myLocationMarkerRef.current = null;
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
      return;
    }

    if (!myLocationMarkerRef.current) {
      myLocationMarkerRef.current = new google.maps.Marker({
        position: currentPosition,
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#2a4dd6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        title: 'My Location',
      });
    } else {
      myLocationMarkerRef.current.setPosition(currentPosition);
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new google.maps.Circle({
        center: currentPosition,
        radius: position.accuracy,
        map,
        fillColor: '#2a4dd6',
        fillOpacity: 0.1,
        strokeColor: '#2a4dd6',
        strokeOpacity: 0.3,
        strokeWeight: 1,
      });
    } else {
      accuracyCircleRef.current.setCenter(currentPosition);
      accuracyCircleRef.current.setRadius(position.accuracy);
    }
  }, [position, showMyLocation]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach(marker => marker.setMap(null));
      myLocationMarkerRef.current?.setMap(null);
      accuracyCircleRef.current?.setMap(null);
      markersRef.current = [];
      myLocationMarkerRef.current = null;
      accuracyCircleRef.current = null;
      mapInstanceRef.current = null;
    };
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedPassenger(null);
  }, []);

  if (useFallback) {
    return (
      <div
        className="relative w-full rounded-2xl overflow-hidden bg-surface-tertiary border border-[#e3e6ed]"
        style={{ height }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
              <IconMapPin size={28} className="text-primary-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Interactive Map</h3>
            <p className="text-sm text-gray-500 mb-4">
              Google Maps integration is ready. Add a `VITE_GOOGLE_MAPS_API_KEY` value to enable the interactive map with real-time passenger locations.
            </p>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary-700 uppercase tracking-wider mb-2">Nearby Passengers</p>
              {allMarkers.slice(0, 4).map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPassenger(p)}
                  className="w-full flex items-center gap-3 bg-white rounded-xl border border-[#e3e6ed] p-3 text-left hover:border-primary-200 hover:shadow-sm transition-all"
                >
                  <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold text-sm">
                    {p.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.destination}</p>
                  </div>
                  <IconLocation size={16} className="text-primary-500" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {selectedPassenger && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 slide-up">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-lg">
                    {selectedPassenger.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{selectedPassenger.name}</h4>
                    <p className="text-xs text-gray-400">Passenger</p>
                  </div>
                </div>
                <button onClick={handleClosePopup} className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors">
                  <IconX size={18} className="text-gray-400" />
                </button>
              </div>
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <IconLocation size={16} className="text-primary-500" />
                  <span>Going to <strong className="text-gray-900">{selectedPassenger.destination}</strong></span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <IconClock size={16} className="text-primary-500" />
                  <span>{Math.round((Date.now() - selectedPassenger.timestamp) / 60000)} min ago</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <IconPhone size={16} className="text-primary-500" />
                  <span>{selectedPassenger.phone}</span>
                </div>
              </div>
              <a
                href={`tel:${selectedPassenger.phone}`}
                className="flex items-center justify-center gap-2 w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-xl transition-all text-sm"
              >
                <IconPhone size={16} /> Call Passenger
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-[#e3e6ed]" style={{ height }}>
      <div ref={mapRef} className="w-full h-full" />
      {!isLoaded && (
        <div className="absolute inset-0 bg-surface-tertiary flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-3 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading map...</p>
          </div>
        </div>
      )}
      {selectedPassenger && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-xl p-4 slide-up z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold">
                {selectedPassenger.name.charAt(0)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 text-sm">{selectedPassenger.name}</h4>
                <p className="text-xs text-gray-400">Going to {selectedPassenger.destination}</p>
              </div>
            </div>
            <button onClick={handleClosePopup} className="p-1.5 rounded-lg hover:bg-surface-secondary transition-colors">
              <IconX size={18} className="text-gray-400" />
            </button>
          </div>
          <div className="flex gap-2">
            <a
              href={`tel:${selectedPassenger.phone}`}
              className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2 rounded-xl transition-all text-sm"
            >
              <IconPhone size={16} /> Call
            </a>
            <button
              onClick={handleClosePopup}
              className="flex-1 flex items-center justify-center gap-2 bg-surface-secondary hover:bg-[#eef0f4] text-gray-700 font-semibold py-2 rounded-xl transition-all text-sm"
            >
              <IconMapPin size={16} /> View Route
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapComponent;
