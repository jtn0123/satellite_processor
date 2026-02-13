import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Satellite, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
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
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
}

const REFRESH_INTERVALS = [
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: '10 min', value: 600000 },
  { label: '30 min', value: 1800000 },
];

export default function LiveTab() {
  const [satellite, setSatellite] = useState('GOES-16');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: frame, isLoading, isError, refetch } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () => api.get('/goes/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
  });

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const imageUrl = frame?.file_path
    ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path || frame.file_path)}`
    : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-900 dark:bg-slate-900 rounded-xl p-6 border border-slate-800 dark:border-slate-800">
        <div>
          <label htmlFor="live-satellite" className="block text-sm font-medium text-slate-400 mb-1">Satellite</label>
          <select id="live-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors">
            {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="live-sector" className="block text-sm font-medium text-slate-400 mb-1">Sector</label>
          <select id="live-sector" value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors">
            {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="live-band" className="block text-sm font-medium text-slate-400 mb-1">Band</label>
          <select id="live-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors">
            {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.description}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="live-auto-refresh" className="block text-sm font-medium text-slate-400 mb-1">Auto-refresh</label>
          <select id="live-auto-refresh" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-none transition-colors">
            {REFRESH_INTERVALS.map((ri) => (
              <option key={ri.value} value={ri.value}>{ri.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Live View */}
      <div ref={containerRef} className={`bg-slate-900 rounded-xl border border-slate-800 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-white">Live View</span>
            {frame && (
              <span className="text-xs text-slate-400">
                {new Date(frame.capture_time).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Refresh now">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Image */}
        <div className={`flex items-center justify-center ${isFullscreen ? 'h-[calc(100vh-52px)]' : 'min-h-[400px]'} bg-black`}>
          {isLoading ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <span className="text-sm">Loading latest frame...</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Satellite className="w-12 h-12" />
              <span className="text-sm">No frames available for this combination</span>
              <span className="text-xs text-slate-600">Try fetching data first from the Fetch tab</span>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={`${satellite} ${band} ${sector}`}
              className="max-w-full max-h-full object-contain"
              loading="lazy"
            />
          ) : null}
        </div>

        {/* Timestamp overlay */}
        {frame && (
          <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur text-white text-xs px-3 py-1.5 rounded-lg">
            {frame.satellite} · {frame.band} · {frame.sector} · {new Date(frame.capture_time).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
