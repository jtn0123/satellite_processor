import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, ImageOverlay, LayersControl } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Satellite } from 'lucide-react';
import api from '../../api/client';

interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
}

interface LatestFrame {
  id: string;
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  file_path: string;
  thumbnail_path: string | null;
}

const SECTOR_BOUNDS: Record<string, Record<string, LatLngBoundsExpression>> = {
  'GOES-16': {
    FullDisk: [[-81.33, -156.29], [81.33, 6.29]],
    CONUS: [[14, -135], [58, -60]],
    Mesoscale1: [[24, -110], [50, -70]],
    Mesoscale2: [[24, -110], [50, -70]],
  },
  'GOES-18': {
    FullDisk: [[-81.33, -216.29], [81.33, -53.71]],
    CONUS: [[14, -170], [58, -95]],
    Mesoscale1: [[24, -145], [50, -105]],
    Mesoscale2: [[24, -145], [50, -105]],
  },
  'GOES-19': {
    FullDisk: [[-81.33, -156.29], [81.33, 6.29]],
    CONUS: [[14, -135], [58, -60]],
    Mesoscale1: [[24, -110], [50, -70]],
    Mesoscale2: [[24, -110], [50, -70]],
  },
};

export default function MapTab() {
  const [satellite, setSatellite] = useState('GOES-16');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [opacity, setOpacity] = useState(0.7);

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: frame } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () => api.get('/goes/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    retry: false,
  });

  const bounds = useMemo(() => {
    return SECTOR_BOUNDS[satellite]?.[sector] || SECTOR_BOUNDS['GOES-16']['CONUS'];
  }, [satellite, sector]);

  const imageUrl = frame?.file_path
    ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path || frame.file_path)}`
    : null;

  // Center map on the sector
  const center = useMemo(() => {
    const b = bounds as [[number, number], [number, number]];
    return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2] as [number, number];
  }, [bounds]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div>
          <label htmlFor="map-satellite" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Satellite</label>
          <select id="map-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden">
            {(products?.satellites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="map-sector" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Sector</label>
          <select id="map-sector" value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden">
            {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="map-band" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Band</label>
          <select id="map-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden">
            {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id}>{b.id} — {b.description}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="map-overlay-opacity" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">
            Overlay Opacity: {Math.round(opacity * 100)}%
          </label>
          <input
            id="map-overlay-opacity"
            type="range" min={0} max={1} step={0.05} value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full accent-primary mt-1"
            aria-label={`Overlay opacity: ${Math.round(opacity * 100)}%`}
          />
        </div>
      </div>

      {/* Map */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden" style={{ height: '600px' }}>
        <MapContainer
          center={center}
          zoom={sector === 'FullDisk' ? 2 : 4}
          className="h-full w-full"
          style={{ background: '#0a1628' }}
        >
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="OpenStreetMap">
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Dark">
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              />
            </LayersControl.BaseLayer>
            {imageUrl && (
              <LayersControl.Overlay checked name="GOES Overlay">
                <ImageOverlay
                  url={imageUrl}
                  bounds={bounds}
                  opacity={opacity}
                />
              </LayersControl.Overlay>
            )}
          </LayersControl>
        </MapContainer>
      </div>

      {/* Info */}
      {frame ? (
        <div className="text-sm text-gray-500 dark:text-slate-400 flex items-center gap-2">
          <Satellite className="w-4 h-4" />
          Showing {frame.satellite} · {frame.band} · {frame.sector} · captured {new Date(frame.capture_time).toLocaleString()}
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-slate-500">
          No frames available for overlay. Fetch data first from the Fetch tab.
        </div>
      )}
    </div>
  );
}
