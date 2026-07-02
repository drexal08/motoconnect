import { useState, useEffect, useRef } from 'react';

interface UseGoogleMapsOptions {
  apiKey?: string;
  libraries?: string[];
}

export function useGoogleMaps(options: UseGoogleMapsOptions = {}) {
  const { apiKey = 'YOUR_GOOGLE_MAPS_API_KEY', libraries = ['places'] } = options;
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    if (window.google?.maps) {
      setIsLoaded(true);
      return;
    }

    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => setIsLoaded(true));
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}`;
    script.async = true;
    script.defer = true;
    
    script.onload = () => {
      setIsLoaded(true);
      setError(null);
    };
    
    script.onerror = () => {
      setError('Failed to load Google Maps');
      setIsLoaded(false);
    };

    document.head.appendChild(script);
    scriptRef.current = script;
  }, [apiKey, libraries]);

  return { isLoaded, error };
}

declare global {
  interface Window {
    google: any;
  }
}
