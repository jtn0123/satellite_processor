import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Satellite, Maximize2, Minimize2, RefreshCw, Download, Zap, Info, Columns2 } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useImageZoom } from '../../hooks/useImageZoom';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import StaleDataBanner from './StaleDataBanner';
import CompareSlider from './CompareSlider';
import InlineFetchProgress from './InlineFetchProgress';

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

function getOverlayPref(): boolean {
  try { return localStorage.getItem('live-overlay-visible') !== 'false'; } catch { return true; }
}

function computeFreshness(catalogLatest: CatalogLatest | undefined, frame: LatestFrame | undefined) {
  if (!catalogLatest || !frame) return null;
  const awsAge = timeAgo(catalogLatest.scan_time);
  const localAge = timeAgo(frame.capture_time);
  const awsMs = Date.now() - new Date(catalogLatest.scan_time).getTime();
  const localMs = Date.now() - new Date(frame.capture_time).getTime();
  const behind = localMs - awsMs;
  const behindMin = Math.floor(behind / 60000);
  return { awsAge, localAge, behindMin };
}

export default function LiveTab() {
  const [satellite, setSatellite] = useState('');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [autoFetch, setAutoFetch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [overlayVisible, setOverlayVisible] = useState(getOverlayPref);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoFetchTime = useRef<string | null>(null);

  const zoom = useImageZoom();

  const toggleOverlay = useCallback(() => {
    setOverlayVisible((v) => {
      const next = !v;
      try { localStorage.setItem('live-overlay-visible', String(next)); } catch { /* noop */ }
      return next;
    });
  }, []);

  const handlePullRefresh = useCallback(async () => {
    await refetchRef.current?.();
  }, []);

  const { containerRef: pullContainerRef, isRefreshing: isPullRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handlePullRefresh,
  });

  const refetchRef = useRef<(() => Promise<unknown>) | null>(null);

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  useEffect(() => {
    if (products && !satellite) {
      setSatellite(products.default_satellite || products.satellites?.[0] || 'GOES-16');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const { data: availability } = useQuery<{ satellite: string; available_sectors: string[]; checked_at: string }>({
    queryKey: ['goes-available', satellite],
    queryFn: () => api.get('/goes/catalog/available', { params: { satellite } }).then((r) => r.data),
    enabled: !!satellite,
    staleTime: 120000,
    retry: 1,
  });

  const { data: frame, isLoading, isError, refetch } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () => api.get('/goes/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
  });

  refetchRef.current = refetch;

  const { data: recentFrames } = useQuery<LatestFrame[]>({
    queryKey: ['goes-frames-compare', satellite, sector, band],
    queryFn: () => api.get('/goes/frames', { params: { satellite, sector, band, limit: 2, sort: 'capture_time', order: 'desc' } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite && compareMode,
  });

  const { data: catalogLatest, isLoading: catalogLoading, isError: catalogError, refetch: refetchCatalog } = useQuery<CatalogLatest>({
    queryKey: ['goes-catalog-latest-live', satellite, sector, band],
    queryFn: () => api.get('/goes/catalog/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: 1,
  });

  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: activeJob } = useQuery<{ id: string; status: string; progress: number; status_message: string }>({
    queryKey: ['live-job', activeJobId],
    queryFn: () => api.get(`/jobs/${activeJobId}`).then((r) => r.data),
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 2000 : false,
  });

  useEffect(() => {
    if (activeJob && (activeJob.status === 'completed' || activeJob.status === 'failed')) {
      const timer = setTimeout(() => {
        setActiveJobId(null);
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeJob, refetch]);

  const fetchNow = useCallback(() => {
    const startDate = catalogLatest?.scan_time ?? new Date().toISOString();
    api.post('/goes/fetch', {
      satellite, sector, band,
      start_date: startDate,
      end_date: startDate,
    }).then((res) => {
      setActiveJobId(res.data.job_id);
      showToast('success', 'Fetching latest frame…');
    }).catch(() => showToast('error', 'Failed to start fetch'));
  }, [satellite, sector, band, catalogLatest]);

  useEffect(() => {
    if (!autoFetch || !catalogLatest || !frame) return;
    const catalogTime = new Date(catalogLatest.scan_time).getTime();
    const localTime = new Date(frame.capture_time).getTime();
    if (catalogTime > localTime && lastAutoFetchTime.current !== catalogLatest.scan_time) {
      lastAutoFetchTime.current = catalogLatest.scan_time;
      api.post('/goes/fetch', {
        satellite: satellite || catalogLatest.satellite,
        sector: sector || catalogLatest.sector,
        band: band || catalogLatest.band,
        start_date: catalogLatest.scan_time,
        end_date: catalogLatest.scan_time,
      }).then((res) => {
        setActiveJobId(res.data.job_id);
        showToast('success', 'Auto-fetching new frame from AWS');
      }).catch(() => {});
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
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) zoom.reset();
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [zoom]);

  const imageUrl = frame?.file_path
    ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path || frame.file_path)}`
    : null;

  const prevFrame = recentFrames?.[1];
  const prevImageUrl = prevFrame?.file_path
    ? `/api/download?path=${encodeURIComponent(prevFrame.thumbnail_path || prevFrame.file_path)}`
    : null;

  const freshnessInfo = computeFreshness(catalogLatest, frame);

  return (
    <div ref={pullContainerRef} className="space-y-6">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isPullRefreshing} />
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
            {(products?.sectors ?? []).map((s) => {
              const unavailable = availability?.available_sectors && !availability.available_sectors.includes(s.id);
              return <option key={s.id} value={s.id} disabled={!!unavailable}>{s.name}{unavailable ? ' (unavailable)' : ''}</option>;
            })}
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

      {/* Auto-fetch + Compare toggles */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl px-6 py-3 border border-gray-200 dark:border-slate-800">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={autoFetch} onChange={(e) => setAutoFetch(e.target.checked)} className="rounded" />
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-gray-700 dark:text-slate-300">Auto-fetch new frames</span>
        </label>
        {autoFetch && (
          <span className="text-xs text-amber-400">Automatically downloads new frames when available on AWS</span>
        )}
        <div className="border-l border-gray-300 dark:border-slate-700 h-5 mx-1" />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} className="rounded" />
          <Columns2 className="w-4 h-4 text-blue-400" />
          <span className="text-gray-700 dark:text-slate-300">Compare frames</span>
        </label>
      </div>

      {/* Stale data warning */}
      {freshnessInfo && frame && (
        <StaleDataBanner
          freshnessInfo={freshnessInfo}
          captureTime={frame.capture_time}
          activeJobId={activeJobId}
          onFetchNow={fetchNow}
        />
      )}

      {/* Inline fetch progress */}
      {activeJobId && activeJob && (
        <InlineFetchProgress job={activeJob} />
      )}

      {/* Two-panel layout: Available Now + Your Latest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Now */}
        <CatalogPanel
          catalogLatest={catalogLatest ?? null}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          satellite={satellite}
          sector={sector}
          band={band}
          onRetry={() => refetchCatalog()}
        />

        {/* Your Latest */}
        <div ref={containerRef} className={`relative bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''}`}>
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
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title="Refresh now" aria-label="Refresh now">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div
            className={`flex items-center justify-center ${isFullscreen ? 'h-[calc(100vh-52px)]' : 'min-h-[300px]'} bg-black overflow-hidden`}
            {...(isFullscreen && !compareMode ? zoom.handlers : {})}
          >
            <ImagePanelContent
              isLoading={isLoading}
              isError={isError}
              imageUrl={imageUrl}
              compareMode={compareMode}
              satellite={satellite}
              band={band}
              sector={sector}
              isFullscreen={isFullscreen}
              zoomStyle={zoom.style}
              prevImageUrl={prevImageUrl}
              comparePosition={comparePosition}
              onPositionChange={setComparePosition}
              frameTime={frame?.capture_time ?? null}
              prevFrameTime={prevFrame?.capture_time ?? null}
            />
          </div>

          {/* Toggleable metadata overlay */}
          {frame && overlayVisible && (
            <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg text-shadow-overlay">
              {frame.satellite} · {frame.band} · {frame.sector} · {new Date(frame.capture_time).toLocaleString()}
            </div>
          )}
          {frame && (
            <button
              onClick={toggleOverlay}
              className={`absolute bottom-4 ${overlayVisible ? 'right-4 translate-x-[calc(-100%-0.5rem)]' : 'right-4'} p-1.5 rounded-lg transition-colors ${overlayVisible ? 'bg-black/50 text-white/70 hover:text-white' : 'bg-black/40 text-white/50 hover:text-white hover:bg-black/60'}`}
              title={overlayVisible ? 'Hide frame info' : 'Show frame info'}
              aria-label={overlayVisible ? 'Hide frame info' : 'Show frame info'}
            >
              <Info className="w-4 h-4" />
            </button>
          )}
          {/* Zoom reset hint */}
          {isFullscreen && zoom.isZoomed && (
            <button
              onClick={zoom.reset}
              className="absolute top-16 right-4 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors"
            >
              Reset zoom
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Extracted image panel content to reduce LiveTab cognitive complexity */
interface ImagePanelContentProps {
  isLoading: boolean;
  isError: boolean;
  imageUrl: string | null;
  compareMode: boolean;
  satellite: string;
  band: string;
  sector: string;
  isFullscreen: boolean;
  zoomStyle: React.CSSProperties;
  prevImageUrl: string | null;
  comparePosition: number;
  onPositionChange: (pos: number) => void;
  frameTime: string | null;
  prevFrameTime: string | null;
}

function ImagePanelContent({ isLoading, isError, imageUrl, compareMode, satellite, band, sector, isFullscreen, zoomStyle, prevImageUrl, comparePosition, onPositionChange, frameTime, prevFrameTime }: Readonly<ImagePanelContentProps>) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-slate-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <span className="text-sm">Loading latest frame...</span>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-500">
        <Satellite className="w-12 h-12" />
        <span className="text-sm">No local frames available</span>
        <span className="text-xs text-gray-400 dark:text-slate-600">Fetch data first from the Fetch tab</span>
      </div>
    );
  }
  if (!imageUrl) return null;
  if (compareMode) {
    return (
      <CompareSlider
        imageUrl={imageUrl}
        prevImageUrl={prevImageUrl}
        comparePosition={comparePosition}
        onPositionChange={onPositionChange}
        frameTime={frameTime}
        prevFrameTime={prevFrameTime}
        timeAgo={timeAgo}
      />
    );
  }
  return (
    <img
      src={imageUrl}
      alt={`${satellite} ${band} ${sector}`}
      className="max-w-full max-h-full object-contain select-none"
      style={isFullscreen ? zoomStyle : undefined}
      draggable={false}
      loading="lazy"
    />
  );
}

/* Extracted catalog panel to reduce LiveTab complexity */
function CatalogPanel({ catalogLatest, catalogLoading, catalogError, satellite, sector, band, onRetry }: Readonly<{
  catalogLatest: CatalogLatest | null;
  catalogLoading: boolean;
  catalogError: boolean;
  satellite: string;
  sector: string;
  band: string;
  onRetry: () => void;
}>) {
  const handleDownload = () => {
    globalThis.dispatchEvent(new CustomEvent('fetch-prefill', {
      detail: {
        satellite: catalogLatest?.satellite || satellite,
        sector: catalogLatest?.sector || sector,
        band: catalogLatest?.band || band,
      },
    }));
    globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' }));
  };

  return (
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
        <CatalogPanelContent
          catalogLatest={catalogLatest}
          catalogLoading={catalogLoading}
          catalogError={catalogError}
          onRetry={onRetry}
          onDownload={handleDownload}
        />
      </div>
    </div>
  );
}

function CatalogPanelContent({ catalogLatest, catalogLoading, catalogError, onRetry, onDownload }: Readonly<{
  catalogLatest: CatalogLatest | null;
  catalogLoading: boolean;
  catalogError: boolean;
  onRetry: () => void;
  onDownload: () => void;
}>) {
  if (catalogLoading) {
    return (
      <div className="space-y-3 animate-pulse py-4">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
          <span className="text-sm text-gray-500 dark:text-slate-400">Checking AWS...</span>
        </div>
        <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
        <div className="h-9 bg-gray-200 dark:bg-slate-700 rounded w-40 mt-2" />
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <span className="text-sm text-red-400">Failed to check AWS catalog</span>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }

  if (catalogLatest) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-600 dark:text-slate-300">
          <strong>{catalogLatest.satellite}</strong> · {catalogLatest.sector} · {catalogLatest.band}
        </div>
        <div className="text-xs text-gray-400 dark:text-slate-500">
          {new Date(catalogLatest.scan_time).toLocaleString()}
        </div>
        <button
          onClick={onDownload}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-gray-900 dark:text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          <Download className="w-4 h-4" />
          Download Latest
        </button>
      </div>
    );
  }

  return (
    <div className="text-sm text-gray-400 dark:text-slate-500 py-8 text-center">
      No catalog data available
    </div>
  );
}
