import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Satellite, Maximize2, Minimize2, RefreshCw, Download, Zap, Info, Columns2, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useMonitorWebSocket } from '../../hooks/useMonitorWebSocket';
import MonitorSettingsPanel from './MonitorSettingsPanel';
import type { MonitorPreset } from './monitorPresets';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useImageZoom } from '../../hooks/useImageZoom';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import StaleDataBanner from './StaleDataBanner';
import CompareSlider from './CompareSlider';
import InlineFetchProgress from './InlineFetchProgress';
import { extractArray } from '../../utils/safeData';

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

function computeFreshness(catalogLatest: CatalogLatest | null | undefined, frame: LatestFrame | null | undefined) {
  if (!catalogLatest || !frame) return null;
  const awsAge = timeAgo(catalogLatest.scan_time);
  const localAge = timeAgo(frame.capture_time);
  const awsMs = Date.now() - new Date(catalogLatest.scan_time).getTime();
  const localMs = Date.now() - new Date(frame.capture_time).getTime();
  const behind = localMs - awsMs;
  const behindMin = Math.floor(behind / 60000);
  return { awsAge, localAge, behindMin };
}

function exitFullscreenSafe() {
  try {
    document.exitFullscreen();
  } catch {
    (document as unknown as { webkitExitFullscreen?: () => void }).webkitExitFullscreen?.();
  }
}

function enterFullscreenSafe(el: HTMLElement) {
  try {
    el.requestFullscreen();
  } catch {
    (el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen?.();
  }
}

function shouldAutoFetch(
  autoFetch: boolean,
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
  lastAutoFetchTime: string | null,
  lastAutoFetchMs: number,
): boolean {
  if (!autoFetch || !catalogLatest || !frame) return false;
  const catalogTime = new Date(catalogLatest.scan_time).getTime();
  const localTime = new Date(frame.capture_time).getTime();
  return catalogTime > localTime && lastAutoFetchTime !== catalogLatest.scan_time && Date.now() - lastAutoFetchMs > 30000;
}

function getSatelliteLabel(s: string, satelliteAvailability?: Record<string, SatelliteAvailability>): string {
  const status = satelliteAvailability?.[s]?.status;
  return status && status !== 'operational' ? `${s} (${status})` : s;
}

function isSectorUnavailable(sectorId: string, availableSectors?: string[]): boolean {
  return !!availableSectors && !availableSectors.includes(sectorId);
}

function useFullscreenSync(
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>,
  zoom: { reset: () => void },
) {
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) zoom.reset();
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [setIsFullscreen, zoom]);
}

interface LiveTabProps {
  onMonitorChange?: (active: boolean) => void;
}

export default function LiveTab({ onMonitorChange }: Readonly<LiveTabProps> = {}) {
  const navigateFn = useNavigate();
  const [satellite, setSatellite] = useState('');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [autoFetch, setAutoFetch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const [overlayVisible, setOverlayVisible] = useState(getOverlayPref);
  const [monitoring, setMonitoring] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoFetchTime = useRef<string | null>(null);
  const lastAutoFetchMs = useRef<number>(0);

  const zoom = useImageZoom();

  const refetchRef = useRef<(() => Promise<unknown>) | null>(null);

  // Monitor mode: WebSocket for frame ingestion push notifications
  const { lastEvent: wsLastEvent } = useMonitorWebSocket(monitoring, { satellite, sector, band });

  // When WS notifies of a new frame, refetch the latest
  useEffect(() => {
    if (wsLastEvent && monitoring) {
      refetchRef.current?.();
    }
  }, [wsLastEvent, monitoring]);

  const toggleMonitor = useCallback(() => {
    setMonitoring((v) => {
      const next = !v;
      setAutoFetch(next);
      showToast(next ? 'success' : 'info', next ? 'Monitor mode activated' : 'Monitor mode stopped');
      onMonitorChange?.(next);
      return next;
    });
  }, [onMonitorChange]);

  const startMonitor = useCallback((config: { satellite: string; sector: string; band: string; interval: number }) => {
    setSatellite(config.satellite);
    setSector(config.sector);
    setBand(config.band);
    setRefreshInterval(config.interval);
    setAutoFetch(true);
    setMonitoring(true);
    onMonitorChange?.(true);
    showToast('success', 'Monitor mode activated');
  }, [onMonitorChange]);

  const stopMonitor = useCallback(() => {
    setMonitoring(false);
    setAutoFetch(false);
    onMonitorChange?.(false);
    showToast('info', 'Monitor mode stopped');
  }, [onMonitorChange]);

  const applyPreset = useCallback((preset: MonitorPreset) => {
    if (preset.satellite) setSatellite(preset.satellite);
    setSector(preset.sector);
    if (preset.band) setBand(preset.band);
    setRefreshInterval(preset.interval);
  }, []);

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

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  useEffect(() => {
    if (products && !satellite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default init
      setSatellite(products.default_satellite || products.satellites?.[0] || 'GOES-16');
    }
  }, [products, satellite]);

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

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const { data: recentFrames } = useQuery<LatestFrame[]>({
    queryKey: ['goes-frames-compare', satellite, sector, band],
    queryFn: () => api.get('/goes/frames', { params: { satellite, sector, band, limit: 2, sort: 'capture_time', order: 'desc' } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite && compareMode,
  });

  const { data: catalogLatest } = useQuery<CatalogLatest>({
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

  const fetchNow = useCallback(async () => {
    const startDate = catalogLatest?.scan_time ?? new Date().toISOString();
    try {
      const res = await api.post('/goes/fetch', {
        satellite: satellite.toUpperCase(), sector, band,
        start_time: startDate,
        end_time: startDate,
      });
      setActiveJobId(res.data.job_id);
      showToast('success', 'Fetching latest frame…');
    } catch {
      showToast('error', 'Failed to start fetch');
    }
  }, [satellite, sector, band, catalogLatest]);

  useEffect(() => {
    if (!shouldAutoFetch(autoFetch, catalogLatest, frame, lastAutoFetchTime.current, lastAutoFetchMs.current)) return;
    lastAutoFetchTime.current = catalogLatest!.scan_time;
    lastAutoFetchMs.current = Date.now();
    const doAutoFetch = async () => {
      try {
        const res = await api.post('/goes/fetch', {
          satellite: (satellite || catalogLatest!.satellite).toUpperCase(),
          sector: sector || catalogLatest!.sector,
          band: band || catalogLatest!.band,
          start_time: catalogLatest!.scan_time,
          end_time: catalogLatest!.scan_time,
        });
        setActiveJobId(res.data.job_id);
        showToast('success', 'Auto-fetching new frame from AWS');
      } catch { /* auto-fetch failure is non-critical */ }
    };
    doAutoFetch();
  }, [autoFetch, catalogLatest, frame, satellite, sector, band]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    if (isCurrentlyFullscreen) {
      exitFullscreenSafe();
    } else {
      enterFullscreenSafe(containerRef.current);
    }
    setIsFullscreen(!isCurrentlyFullscreen);
  }, []);

  useFullscreenSync(setIsFullscreen, zoom);

  // Reset zoom when satellite/sector/band changes
  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom]);

  const imageUrl = frame?.file_path
    ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path || frame.file_path)}`
    : null;

  const recentFramesList = extractArray<LatestFrame>(recentFrames);
  const prevFrame = recentFramesList?.[1];
  const prevImageUrl = prevFrame?.file_path
    ? `/api/download?path=${encodeURIComponent(prevFrame.thumbnail_path || prevFrame.file_path)}`
    : null;

  const freshnessInfo = computeFreshness(catalogLatest, frame);

  return (
    <div ref={pullContainerRef} className="relative h-[calc(100dvh-4rem)] md:h-[calc(100dvh-4rem)] max-md:h-[calc(100dvh-8rem)] flex flex-col bg-black">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isPullRefreshing} />

      {/* Full-bleed image area */}
      <div
        ref={containerRef}
        className={`relative flex-1 flex items-center justify-center overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
        {...(compareMode ? {} : zoom.handlers)}
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
          onNavigateToFetch={() => navigateFn('/goes?tab=fetch')}
        />

        {/* Top controls overlay */}
        <div className="absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none">
          <div className="pointer-events-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 px-4 py-3">
            <select id="live-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)} aria-label="Satellite"
              className="rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.satellites ?? []).map((s) => (
                <option key={s} value={s} className="bg-space-900 text-white">{getSatelliteLabel(s, products?.satellite_availability)}</option>
              ))}
            </select>
            <select id="live-sector" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"
              className="rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.sectors ?? []).map((s) => {
                const unavailable = isSectorUnavailable(s.id, availability?.available_sectors);
                return <option key={s.id} value={s.id} disabled={unavailable} className="bg-space-900 text-white">{s.name}{unavailable ? ' (unavailable)' : ''}</option>;
              })}
            </select>
            <select id="live-band" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Band"
              className="rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id} className="bg-space-900 text-white">{b.id} — {b.description}</option>)}
            </select>
            <select id="live-auto-refresh" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} aria-label="Auto-refresh interval"
              className="rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {REFRESH_INTERVALS.map((ri) => (
                <option key={ri.value} value={ri.value} className="bg-space-900 text-white">{ri.label}</option>
              ))}
            </select>

            <div className="hidden sm:flex items-center gap-2 ml-2">
              <button
                onClick={toggleMonitor}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
                  monitoring
                    ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
                    : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20'
                }`}
                title={monitoring ? 'Stop watching' : 'Start watching'}
                aria-label={monitoring ? 'Stop watching' : 'Start watching'}
                data-testid="watch-toggle-btn"
              >
                {monitoring ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {monitoring ? 'Stop Watch' : 'Watch'}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-white/80 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={autoFetch} onChange={(e) => setAutoFetch(e.target.checked)} className="rounded" />
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Auto-fetch
              </label>
              <label className="flex items-center gap-1.5 text-xs text-white/80 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} className="rounded" />
                <Columns2 className="w-3.5 h-3.5 text-blue-400" />
                Compare
              </label>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <MonitorSettingsPanel
                isMonitoring={monitoring}
                interval={refreshInterval}
                satellite={satellite}
                sector={sector}
                band={band}
                onStart={startMonitor}
                onStop={stopMonitor}
                onApplyPreset={applyPreset}
                satellites={products?.satellites ?? []}
                sectors={(products?.sectors ?? []).map((s) => ({ id: s.id, name: s.name }))}
                bands={(products?.bands ?? []).map((b) => ({ id: b.id, description: b.description }))}
              />
              <button onClick={() => refetch()}
                className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px]"
                title="Refresh now" aria-label="Refresh now">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={toggleFullscreen}
                className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px]"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Stale data warning overlay */}
        {freshnessInfo && frame && (
          <div className="absolute top-16 inset-x-4 z-10">
            <StaleDataBanner
              freshnessInfo={freshnessInfo}
              captureTime={frame.capture_time}
              activeJobId={activeJobId}
              onFetchNow={fetchNow}
            />
          </div>
        )}

        {/* Inline fetch progress overlay */}
        {activeJobId && activeJob && (
          <div className="absolute top-16 inset-x-4 z-10">
            <InlineFetchProgress job={activeJob} />
          </div>
        )}

        {/* Bottom metadata overlay */}
        <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none">
          <div className="pointer-events-auto flex items-end justify-between px-4 py-3">
            {frame && overlayVisible && (
              <div className="space-y-1">
                <div className="text-white text-lg font-semibold text-shadow-overlay">
                  {new Date(frame.capture_time).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{frame.satellite}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{frame.band}</span>
                  <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{frame.sector}</span>
                  <span className="text-white/50 text-xs ml-1">{timeAgo(frame.capture_time)}</span>
                </div>
              </div>
            )}
            {!frame && <div />}

            <div className="flex items-center gap-2">
              {catalogLatest && (
                <div className="text-right mr-2">
                  <div className="text-white/50 text-[10px] uppercase tracking-wider">AWS Latest</div>
                  <div className="text-white/80 text-xs">{timeAgo(catalogLatest.scan_time)}</div>
                </div>
              )}
              {frame && (
                <button
                  onClick={() => {
                    const url = `/api/download?path=${encodeURIComponent(frame.file_path)}`;
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = frame.file_path.split('/').pop() ?? 'frame';
                    a.click();
                  }}
                  className="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                  title="Download frame"
                  aria-label="Download frame"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={toggleOverlay}
                className="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-colors"
                title={overlayVisible ? 'Hide frame info' : 'Show frame info'}
                aria-label={overlayVisible ? 'Hide frame info' : 'Show frame info'}
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Live / Monitoring indicator */}
        <div className="absolute top-16 left-4 z-10 flex items-center gap-2" data-testid="live-indicator">
          <div className={`w-2 h-2 rounded-full ${monitoring ? 'bg-emerald-400' : 'bg-emerald-400/50'} animate-pulse`} />
          <span className="text-xs text-white/70 font-medium">
            {monitoring ? 'MONITORING' : 'LIVE'}
          </span>
        </div>

        {/* Zoom reset hint */}
        {zoom.isZoomed && (
          <button
            onClick={zoom.reset}
            className="absolute top-20 right-4 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors"
          >
            Reset zoom
          </button>
        )}
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
  onNavigateToFetch?: () => void;
}

function ImagePanelContent({ isLoading, isError, imageUrl, compareMode, satellite, band, sector, isFullscreen, zoomStyle, prevImageUrl, comparePosition, onPositionChange, frameTime, prevFrameTime, onNavigateToFetch }: Readonly<ImagePanelContentProps>) {
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
      <div className="flex flex-col items-center gap-4 text-gray-400 dark:text-slate-500 py-8">
        <Satellite className="w-12 h-12" />
        <span className="text-sm font-medium">No local frames available</span>
        <span className="text-xs text-gray-400 dark:text-slate-600">Fetch your first image to see it here</span>
        <button
          onClick={() => {
            globalThis.dispatchEvent(new CustomEvent('fetch-prefill', {
              detail: { satellite, sector, band },
            }));
            onNavigateToFetch?.();
          }}
          className="flex items-center gap-2 px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Fetch your first image
        </button>
      </div>
    );
  }
  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center gap-4 text-gray-400 dark:text-slate-500 py-8">
        <Satellite className="w-12 h-12" />
        <span className="text-sm font-medium">No frames loaded yet</span>
        <span className="text-xs text-gray-400 dark:text-slate-600">Select a satellite, sector, and band above, then fetch imagery</span>
        <button
          onClick={() => onNavigateToFetch?.()}
          className="flex items-center gap-2 px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Go to Fetch
        </button>
      </div>
    );
  }
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

/* CatalogPanel removed — catalog info now shown in bottom overlay */
