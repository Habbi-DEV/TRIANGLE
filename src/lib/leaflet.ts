// Lazy-loads Leaflet from a CDN (no npm dependency, no API key — unlike
// Google Maps' JS SDK, Leaflet + OpenStreetMap tiles work with zero billing
// setup, which matters for a small-restaurant deploy). Injected once, on
// first use, and cached so every map on the page shares the same instance.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LeafletNS = any;

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

const CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

let loadPromise: Promise<LeafletNS> | null = null;

export function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet requires a browser environment'));
  }
  if (window.L) return Promise.resolve(window.L);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[data-leaflet-css]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      link.setAttribute('data-leaflet-css', 'true');
      document.head.appendChild(link);
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-leaflet-js]');
    if (existing) {
      if (window.L) return resolve(window.L);
      existing.addEventListener('load', () => resolve(window.L));
      existing.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
      return;
    }

    const script = document.createElement('script');
    script.src = JS_URL;
    script.async = true;
    script.setAttribute('data-leaflet-js', 'true');
    script.onload = () => resolve(window.L!);
    script.onerror = () => {
      loadPromise = null; // allow a retry later (e.g. flaky connection)
      reject(new Error('Leaflet failed to load'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
