import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Satellite, Maximize2, Minimize2, RefreshCw, Download, Clock, Zap } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';

interface SatelliteAvailability {
  status: string;
  description: string;
}

interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
  default_satellite?: string;
  satellite_availability?: Record<string, SatelliteAvailability>;
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

interface CatalogLatest {
  scan_time: string;
  size: number;
  key: string;
  satellite: string;
  sector: string;
  band: string;
}

const REFRESH_INTERVALS = [
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: '10 min', value: 600000 },
  { label: '30 min', value: 1800000 },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LiveTab() {
  const [satellite, setSatellite] = useState('');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [autoFetch, setAutoFetch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoFetchTime = useRef<string | null>(null);

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  // Set default satellite from API response
  useEffect(() => {
    if (products && !satellite) {
      setSatellite(products.default_satellite || products.satellites?.[0] || 'GOES-16');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only set default once when products loads
  }, [products]);

  // Your Latest (local frame)
  const { data: frame, isLoading, isError, refetch } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () => api.get('/goes/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
  });

  // Available Now (from AWS catalog)
  const { data: catalogLatest } = useQuery<CatalogLatest>({
    queryKey: ['goes-catalog-latest-live', satellite, sector, band],
    queryFn: () => api.get('/goes/catalog/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: 1,
  });

  // Auto-fetch logic — guard prevents duplicate requests for the same scan_time
  useEffect(() => {
    if (!autoFetch || !catalogLatest || !frame) return;
    const catalogTime = new Date(catalogLatest.scan_time).getTime();
    const localTime = new Date(frame.capture_time).getTime();
    if (catalogTime > localTime && lastAutoFetchTime.current !== catalogLatest.scan_time) {
      lastAutoFetchTime.current = catalogLatest.scan_time;
      api.post('/goes/fetch', {
        satellite: catalogLatest.satellite || satellite,
        sector: catalogLatest.sector || sector,
        band: catalogLatest.band || band,
        start_date: catalogLatest.scan_time,
        end_date: catalogLatest.scan_time,
      }).then(() => {
        showToast('success', 'Auto-fetching new frame from AWS');
      }).catch(() => {
        // silent fail for auto-fetch
      });
    }
  }, [autoFetch, catalogLatest, frame, satellite, sector, band]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
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

  // Freshness comparison
  const freshnessInfo = catalogLatest && frame ? (() => {
    const awsAge = timeAgo(catalogLatest.scan_time);
    const localAge = timeAgo(frame.capture_time);
    const awsMs = Date.now() - new Date(catalogLatest.scan_time).getTime();
    const localMs = Date.now() - new Date(frame.capture_time).getTime();
    const behind = localMs - awsMs;
    const behindMin = Math.floor(behind / 60000);
    return { awsAge, localAge, behindMin };
  })() : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div>
          <label htmlFor="live-satellite" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Satellite</label>
          <select id="live-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors">
            {(products?.satellites ?? []).map((s) => {
              const avail = products?.satellite_availability?.[s];
              const status = avail?.status;
              const label = status && status !== 'operational' ? `${s} (${status})` : s;
              return <option key={s} value={s}>{label}</option>;
            })}
          </select>
        </div>
        <div>
          <label htmlFor="live-sector" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Sector</label>
          <select id="live-sector" value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors">
            {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="live-band" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Band</label>
          <select id="live-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors">
            {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id}>{b.id} — {b.description}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="live-auto-refresh" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Auto-refresh</label>
          <select id="live-auto-refresh" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors">
            {REFRESH_INTERVALS.map((ri) => (
              <option key={ri.value} value={ri.value}>{ri.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Auto-fetch toggle */}
      <div className="flex items-center gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl px-6 py-3 border border-gray-200 dark:border-slate-800">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={autoFetch}
            onChange={(e) => setAutoFetch(e.target.checked)}
            className="rounded"
          />
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-gray-700 dark:text-slate-300">Auto-fetch new frames</span>
        </label>
        {autoFetch && (
          <span className="text-xs text-amber-400">Automatically downloads new frames when available on AWS</span>
        )}
      </div>

      {/* Freshness Comparison */}
      {freshnessInfo && freshnessInfo.behindMin > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-6 py-3 flex items-center gap-3">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-sm text-amber-300">
            AWS has a frame from <strong>{freshnessInfo.awsAge}</strong>, your latest is <strong>{freshnessInfo.localAge}</strong>
            {freshnessInfo.behindMin > 0 && ` (${freshnessInfo.behindMin} min behind)`}
          </span>
        </div>
      )}

      {/* Two-panel layout: Available Now + Your Latest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Now */}
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Satellite className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Available Now</span>
            </div>
            {catalogLatest && (
              <span className="text-xs text-gray-500 dark:text-slate-400">{timeAgo(catalogLatest.scan_time)}</span>
            )}
          </div>
          <div className="p-6">
            {catalogLatest ? (
              <div className="space-y-3">
                <div className="text-sm text-gray-600 dark:text-slate-300">
                  <strong>{catalogLatest.satellite}</strong> · {catalogLatest.sector} · {catalogLatest.band}
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {new Date(catalogLatest.scan_time).toLocaleString()}
                </div>
                <button
                  onClick={() => {
                    const switchTab = new CustomEvent('switch-tab', { detail: 'fetch' });
                    globalThis.dispatchEvent(switchTab);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-gray-900 dark:text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Latest
                </button>
              </div>
            ) : (
              <div className="text-sm text-gray-400 dark:text-slate-500 py-8 text-center">
                No catalog data available
              </div>
            )}
          </div>
        </div>

        {/* Your Latest */}
        <div ref={containerRef} className={`bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-slate-800 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">Your Latest</span>
              {frame && (
                <span className="text-xs text-gray-500 dark:text-slate-400">
                  {timeAgo(frame.capture_time)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="Refresh now" aria-label="Refresh now">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className={`flex items-center justify-center ${isFullscreen ? 'h-[calc(100vh-52px)]' : 'min-h-[300px]'} bg-black`}>
            {isLoading && (
              <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <span className="text-sm">Loading latest frame...</span>
              </div>
            )}
            {!isLoading && isError && (
              <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-500">
                <Satellite className="w-12 h-12" />
                <span className="text-sm">No local frames available</span>
                <span className="text-xs text-gray-400 dark:text-slate-600">Fetch data first from the Fetch tab</span>
              </div>
            )}
            {!isLoading && !isError && imageUrl && (
              <img
                src={imageUrl}
                alt={`${satellite} ${band} ${sector}`}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
              />
            )}
          </div>

          {frame && (
            <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg text-shadow-overlay">
              {frame.satellite} · {frame.band} · {frame.sector} · {new Date(frame.capture_time).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
