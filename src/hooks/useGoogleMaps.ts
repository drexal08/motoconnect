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
    const normalizedKey = apiKey.trim();

    if (
      !normalizedKey ||
      normalizedKey === 'demo' ||
      normalizedKey === 'YOUR_GOOGLE_MAPS_API_KEY'
    ) {
      setIsLoaded(false);
      setError('Missing Google Maps API key');
      return;
    }

    if (window.google?.maps) {
      setIsLoaded(true);
      setError(null);
      return;
    }

    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      const handleLoad = () => {
        setIsLoaded(true);
        setError(null);
      };

      const handleError = () => {
        setError('Failed to load Google Maps');
        setIsLoaded(false);
      };

      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${normalizedKey}&libraries=${libraries.join(',')}`;
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

    return () => {
      if (scriptRef.current) {
        scriptRef.current.onload = null;
        scriptRef.current.onerror = null;
      }
    };
  }, [apiKey, libraries]);

  return { isLoaded, error };
}

declare global {
  interface Window {
    google: any;
  }
}
