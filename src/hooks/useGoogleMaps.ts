import { useEffect, useState } from 'react';

const KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

let loadPromise: Promise<boolean> | null = null;

function loadMaps(): Promise<boolean> {
  if (!KEY) return Promise.resolve(false);
  if (window.google?.maps) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&loading=async&v=weekly`;
    script.async = true;
    script.onload = () => resolve(!!window.google?.maps);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** True when no API key is configured (used to render the designed empty state). */
export function hasMapsKey(): boolean {
  return KEY.length > 0;
}

/** Loads the Maps JS API once; resolves false when key missing or script failed. */
export function useGoogleMaps(): { loaded: boolean } {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let mounted = true;
    loadMaps().then((ok) => {
      if (mounted) setLoaded(ok);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return { loaded };
}
