import { useEffect, useRef } from 'react';
import { loadLeaflet, type LeafletNS } from '../../lib/leaflet';

export interface MapMarkerSpec {
  id: string;
  lat: number;
  lng: number;
  /** Pin color (any CSS color). Defaults to the brand orange. */
  color?: string;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}

interface Props {
  center: [number, number];
  zoom?: number;
  markers?: MapMarkerSpec[];
  /** Straight line connecting these points (e.g. driver -> destination). */
  polyline?: [number, number][];
  /** false = no drag/scroll/zoom — used for the small read-only preview on
   *  an order card. Defaults to true (full interactive map). */
  interactive?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  /** Recenters/zooms to fit every marker + the polyline whenever they
   *  change — handy for the driver route map, where both the driver's
   *  live position and the destination need to stay in frame. */
  fitToMarkers?: boolean;
  className?: string;
  /** Called once the map has given up rendering — either the Leaflet
   *  script/CSS failed to load, or the tile provider is refusing/timing
   *  out tiles (see TILE_SOURCES below). Callers should show a fallback
   *  (e.g. an "open in Google Maps" link) instead of leaving a blank box. */
  onLoadError?: () => void;
}

// Two tile sources, tried in order. CARTO is primary: unlike raw
// tile.openstreetmap.org, it's a CDN meant to be embedded in third-party
// apps at real traffic volumes and doesn't throttle/block normal usage —
// tile.openstreetmap.org's own usage policy explicitly asks non-trivial
// apps NOT to hotlink it directly, and in practice it does return
// 429/503 once a small delivery app's combined tile requests (several
// mini-maps per screen, refreshed often) cross its threshold. That 429 is
// exactly the "the map inside the app sometimes doesn't work" symptom.
// OSM's own tiles are kept as an automatic fallback in case CARTO is ever
// unreachable, so the map degrades instead of going blank.
const TILE_SOURCES = [
  {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
  },
  {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    subdomains: 'abc',
  },
];
// After this many failed tile loads on the current source, swap to the
// next one rather than leaving the driver staring at empty grey squares.
const MAX_TILE_ERRORS_BEFORE_FALLBACK = 6;

function makeIcon(L: LeafletNS, color: string) {
  return L.divIcon({
    className: '',
    html: `<span style="
      display:block;width:16px;height:16px;border-radius:9999px;
      background:${color};border:3px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,.4);
    "></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

/**
 * Thin imperative wrapper around vanilla Leaflet (loaded from a CDN — see
 * lib/leaflet.ts). Kept imperative rather than using react-leaflet so no
 * extra npm dependency is needed and the map keeps working even if the
 * package registry the build reaches isn't the same one this preview used.
 */
export default function LeafletMap({
  center, zoom = 15, markers = [], polyline, interactive = true,
  onMapClick, fitToMarkers, className, onLoadError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletNS | null>(null);
  const layerRef = useRef<LeafletNS | null>(null);
  const tileLayerRef = useRef<LeafletNS | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  // Init once.
  useEffect(() => {
    let cancelled = false;
    let tileErrorCount = 0;
    let sourceIndex = 0;

    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        const map = L.map(containerRef.current, {
          center,
          zoom,
          zoomControl: interactive,
          dragging: interactive,
          scrollWheelZoom: interactive,
          doubleClickZoom: interactive,
          touchZoom: interactive,
          boxZoom: interactive,
          keyboard: interactive,
          attributionControl: interactive,
        });

        const attachTileLayer = (index: number) => {
          const source = TILE_SOURCES[index];
          tileLayerRef.current?.remove();
          tileErrorCount = 0;
          const layer = L.tileLayer(source.url, {
            maxZoom: 19,
            attribution: source.attribution,
            subdomains: source.subdomains,
          });
          layer.on('tileerror', () => {
            tileErrorCount += 1;
            if (tileErrorCount < MAX_TILE_ERRORS_BEFORE_FALLBACK) return;
            const nextIndex = sourceIndex + 1;
            if (nextIndex < TILE_SOURCES.length) {
              // Primary source is struggling (rate-limited/unreachable) —
              // swap to the backup instead of leaving grey squares.
              sourceIndex = nextIndex;
              attachTileLayer(nextIndex);
            } else {
              // Every source failed — nothing left to fall back to.
              onLoadErrorRef.current?.();
            }
          });
          layer.addTo(map);
          tileLayerRef.current = layer;
        };
        attachTileLayer(0);

        if (onMapClickRef.current) {
          map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
            onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
          });
        }
        layerRef.current = L.layerGroup().addTo(map);
        mapRef.current = map;
        // Leaflet needs a nudge once its container has real dimensions
        // (e.g. right after a modal's open animation finishes).
        setTimeout(() => map.invalidateSize(), 250);
      })
      .catch(() => onLoadErrorRef.current?.());

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers/polyline, and recenter, whenever they change.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled) return;
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      const bounds: [number, number][] = [];

      for (const m of markers) {
        const marker = L.marker([m.lat, m.lng], {
          icon: makeIcon(L, m.color || '#f97316'),
          draggable: !!m.draggable,
        });
        if (m.draggable && m.onDragEnd) {
          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            m.onDragEnd?.(pos.lat, pos.lng);
          });
        }
        marker.addTo(layer);
        bounds.push([m.lat, m.lng]);
      }

      if (polyline && polyline.length > 1) {
        L.polyline(polyline, { color: '#3b82f6', weight: 3, dashArray: '6 6' }).addTo(layer);
        bounds.push(...polyline);
      }

      if (fitToMarkers && bounds.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32] });
      } else if (fitToMarkers && bounds.length === 1) {
        map.setView(bounds[0], zoom);
      } else {
        map.setView(center, zoom);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(markers), JSON.stringify(polyline), center[0], center[1], zoom, fitToMarkers]);

  return <div ref={containerRef} className={className} />;
}
