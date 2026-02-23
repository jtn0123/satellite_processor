import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Satellite, Maximize2, Minimize2, RefreshCw, Download, Zap, Info, Columns2, Eye, EyeOff, SlidersHorizontal, X } from 'lucide-react';
import axios from 'axios';
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
import {
  getFriendlyBandLabel,
  getFriendlyBandName,
  saveCachedImage,
  loadCachedImage,
} from './liveTabUtils';
import type { CachedImageMeta } from './liveTabUtils';

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
  image_url: string;
  thumbnail_url: string | null;
  file_path?: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path?: string | null;
}

interface CatalogLatest {
  scan_time: string;
  size: number;
  key: string;
  satellite: string;
  sector: string;
  band: string;
  image_url?: string;
  thumbnail_url?: string;
  mobile_url?: string;
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

async function exitFullscreenSafe() {
  try {
    await document.exitFullscreen();
  } catch {
    await (document as unknown as { webkitExitFullscreen?: () => Promise<void> }).webkitExitFullscreen?.();
  }
}

async function enterFullscreenSafe(el: HTMLElement) {
  try {
    await el.requestFullscreen();
  } catch {
    await (el as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen?.();
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

/* Extracted fetch-job logic to reduce LiveTab cognitive complexity */
function useLiveFetchJob({
  satellite, sector, band, autoFetch, catalogLatest, frame,
  lastAutoFetchTimeRef, lastAutoFetchMsRef, refetch,
}: {
  satellite: string; sector: string; band: string; autoFetch: boolean;
  catalogLatest: CatalogLatest | null; frame: LatestFrame | null;
  lastAutoFetchTimeRef: React.MutableRefObject<string | null>;
  lastAutoFetchMsRef: React.MutableRefObject<number>;
  refetch: () => Promise<unknown>;
}) {
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
    if (!shouldAutoFetch(autoFetch, catalogLatest, frame, lastAutoFetchTimeRef.current, lastAutoFetchMsRef.current)) return;
    lastAutoFetchTimeRef.current = catalogLatest!.scan_time;
    lastAutoFetchMsRef.current = Date.now();
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
  }, [autoFetch, catalogLatest, frame, satellite, sector, band, lastAutoFetchTimeRef, lastAutoFetchMsRef]);

  return { activeJobId, activeJob: activeJob ?? null, fetchNow };
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
    retry: (failureCount, error) => {
      // Don't retry on 404 (no frames) — show empty state immediately
      if (axios.isAxiosError(error) && error.response?.status === 404) return false;
      return failureCount < 2;
    },
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

  const { activeJobId, activeJob, fetchNow } = useLiveFetchJob({
    satellite, sector, band, autoFetch, catalogLatest: catalogLatest ?? null,
    frame: frame ?? null, lastAutoFetchTimeRef: lastAutoFetchTime, lastAutoFetchMsRef: lastAutoFetchMs, refetch,
  });

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    if (isCurrentlyFullscreen) {
      await exitFullscreenSafe();
    } else {
      await enterFullscreenSafe(containerRef.current);
    }
    setIsFullscreen(!isCurrentlyFullscreen);
  }, []);

  useFullscreenSync(setIsFullscreen, zoom);

  // Reset zoom when satellite/sector/band changes
  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom]);

  // Primary: local frame if available; fallback: catalog CDN URL (responsive)
  const catalogImageUrl = (globalThis.window !== undefined && globalThis.window.innerWidth < 768
    ? catalogLatest?.mobile_url
    : catalogLatest?.image_url) ?? catalogLatest?.image_url ?? null;
  const localImageUrl = frame?.thumbnail_url ?? frame?.image_url ?? null;
  const imageUrl = localImageUrl ?? catalogImageUrl;

  const recentFramesList = extractArray<LatestFrame>(recentFrames);
  const prevFrame = recentFramesList?.[1];
  const prevImageUrl = prevFrame?.thumbnail_url ?? prevFrame?.image_url ?? null;

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
          isLoading={isLoading && !catalogImageUrl}
          isError={isError && !imageUrl}
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
              {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id} className="bg-space-900 text-white">{getFriendlyBandLabel(b.id, b.description)}</option>)}
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

            <div className="col-span-2 sm:col-span-1 sm:ml-auto flex items-center gap-2 justify-end">
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
        {freshnessInfo && frame && localImageUrl && (
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
        <BottomMetadataOverlay
          frame={frame ?? null}
          catalogLatest={catalogLatest ?? null}
          overlayVisible={overlayVisible}
          onToggleOverlay={toggleOverlay}
        />

        {/* Live / Monitoring indicator */}
        <div className="absolute top-16 left-4 z-10 flex items-center gap-2" data-testid="live-indicator">
          <div className={`w-2 h-2 rounded-full ${monitoring ? 'bg-emerald-400' : 'bg-emerald-400/50'} animate-pulse`} />
          <span className="text-xs text-white/70 font-medium">
            {monitoring ? 'MONITORING' : 'LIVE'}
          </span>
        </div>

        {/* Mobile FAB for controls */}
        <div className="sm:hidden absolute bottom-24 right-4 z-20" data-testid="mobile-fab">
          <MobileControlsFab
            monitoring={monitoring}
            onToggleMonitor={toggleMonitor}
            autoFetch={autoFetch}
            onAutoFetchChange={setAutoFetch}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
          />
        </div>

        {/* Zoom reset hint */}
        {zoom.isZoomed && (
          <button
            onClick={zoom.reset}
            className="absolute top-20 right-4 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
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

/* Floating action button for mobile — shows Watch/Auto-fetch/Compare toggles */
/* Extracted bottom metadata overlay to reduce LiveTab cognitive complexity */
function BottomMetadataOverlay({ frame, catalogLatest, overlayVisible, onToggleOverlay }: Readonly<{
  frame: LatestFrame | null;
  catalogLatest: CatalogLatest | null;
  overlayVisible: boolean;
  onToggleOverlay: () => void;
}>) {
  const metaContent = (() => {
    if (frame && overlayVisible) {
      return (
        <div className="space-y-1">
          <div className="text-white text-lg font-semibold text-shadow-overlay">
            {new Date(frame.capture_time).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{frame.satellite}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{getFriendlyBandName(frame.band)}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{frame.sector}</span>
            <span className="text-white/50 text-xs ml-1">{timeAgo(frame.capture_time)}</span>
          </div>
        </div>
      );
    }
    if (!frame && catalogLatest && overlayVisible) {
      return (
        <div className="space-y-1">
          <div className="text-white text-lg font-semibold text-shadow-overlay">
            {new Date(catalogLatest.scan_time).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{catalogLatest.satellite}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{getFriendlyBandName(catalogLatest.band)}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/15 backdrop-blur-sm text-white/90 text-xs">{catalogLatest.sector}</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 backdrop-blur-sm text-amber-300 text-xs ml-1">via NOAA CDN</span>
            <span className="text-white/50 text-xs ml-1">{timeAgo(catalogLatest.scan_time)}</span>
          </div>
        </div>
      );
    }
    return <div />;
  })();

  return (
    <div className="absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none">
      <div className="pointer-events-auto flex items-end justify-between px-4 py-3">
        {metaContent}
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
                const url = frame.image_url;
                const a = document.createElement('a');
                a.href = url;
                a.download = `${frame.satellite}_${frame.band}_${frame.sector}.png`;
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
            onClick={onToggleOverlay}
            className="p-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            title={overlayVisible ? 'Hide frame info' : 'Show frame info'}
            aria-label={overlayVisible ? 'Hide frame info' : 'Show frame info'}
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileControlsFab({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, compareMode, onCompareModeChange }: Readonly<{
  monitoring: boolean; onToggleMonitor: () => void;
  autoFetch: boolean; onAutoFetchChange: (v: boolean) => void;
  compareMode: boolean; onCompareModeChange: (v: boolean) => void;
}>) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [open]);

  return (
    <div ref={fabRef} className="relative">
      {open && (
        <div id="fab-menu" className="absolute bottom-14 right-0 flex flex-col gap-2 p-3 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 min-w-[180px]" data-testid="fab-menu">
          <button
            onClick={() => { onToggleMonitor(); setOpen(false); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
              monitoring
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                : 'bg-white/10 border border-white/20 text-white/80'
            }`}
          >
            {monitoring ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {monitoring ? 'Stop Watch' : 'Watch'}
          </button>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-xs text-white/80 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={autoFetch} onChange={(e) => onAutoFetchChange(e.target.checked)} className="rounded" />
            <Zap className="w-4 h-4 text-amber-400" />
            Auto-fetch
          </label>
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-xs text-white/80 cursor-pointer min-h-[44px]">
            <input type="checkbox" checked={compareMode} onChange={(e) => onCompareModeChange(e.target.checked)} className="rounded" />
            <Columns2 className="w-4 h-4 text-blue-400" />
            Compare
          </label>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
        aria-label="Toggle controls"
        aria-expanded={open}
        aria-controls="fab-menu"
        data-testid="fab-toggle"
      >
        {open ? <X className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
      </button>
    </div>
  );
}

function ImagePanelContent({ isLoading, isError, imageUrl, compareMode, satellite, band, sector, isFullscreen, zoomStyle, prevImageUrl, comparePosition, onPositionChange, frameTime, prevFrameTime, onNavigateToFetch }: Readonly<ImagePanelContentProps>) {
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center" data-testid="loading-shimmer">
        <div className="w-full h-full max-w-[90%] max-h-[90%] rounded-lg bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse" />
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
    <CdnImage
      src={imageUrl}
      alt={`${satellite} ${band} ${sector}`}
      className="max-w-full max-h-full object-contain select-none"
      style={isFullscreen ? zoomStyle : undefined}
      draggable={false}
      data-satellite={satellite}
      data-band={band}
      data-sector={sector}
    />
  );
}

/* CdnImage — img with onError fallback, shimmer placeholder, crossfade, and offline cache */
interface CdnImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  'data-satellite'?: string;
  'data-band'?: string;
  'data-sector'?: string;
}

function CdnImage({ src, alt, className, ...props }: CdnImageProps) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [cachedMeta, setCachedMeta] = useState<CachedImageMeta | null>(null);
  const [displaySrc, setDisplaySrc] = useState(src);

  // Reset state when src changes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setError(false);
    setLoaded(false);
    setUsingCached(false);
    setCachedMeta(null);
    setDisplaySrc(src);
  }, [src]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dataSatellite = props['data-satellite'];
  const dataBand = props['data-band'];
  const dataSector = props['data-sector'];

  const handleLoad = useCallback(() => {
    setLoaded(true);
    // Cache successful load
    if (src && !usingCached) {
      saveCachedImage(src, {
        satellite: dataSatellite ?? '',
        band: dataBand ?? '',
        sector: dataSector ?? '',
        timestamp: new Date().toISOString(),
      });
    }
  }, [src, usingCached, dataSatellite, dataBand, dataSector]);

  const handleError = useCallback(() => {
    // Try cached image before showing error
    if (!usingCached) {
      const cached = loadCachedImage();
      if (cached) {
        setUsingCached(true);
        setCachedMeta(cached);
        setDisplaySrc(cached.url);
        setError(false);
        setLoaded(false);
        return;
      }
    }
    setError(true);
  }, [usingCached]);

  if (error || !displaySrc) {
    return (
      <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-slate-500 py-8">
        <Satellite className="w-12 h-12" />
        <span className="text-sm font-medium">Image unavailable</span>
        <span className="text-xs text-gray-400 dark:text-slate-600">The satellite image could not be loaded</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Cached image banner */}
      {usingCached && cachedMeta && (
        <div className="absolute top-2 inset-x-4 z-20 flex items-center justify-center" data-testid="cached-image-banner">
          <div className="px-4 py-2 rounded-lg bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-amber-200 text-xs font-medium">
            Showing cached image from {new Date(cachedMeta.timestamp).toLocaleString()}
          </div>
        </div>
      )}
      {/* Shimmer placeholder */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center" data-testid="image-shimmer">
          <div className="w-full h-full max-w-[90%] max-h-[90%] rounded-lg bg-gradient-to-r from-white/5 via-white/10 to-white/5 animate-pulse" />
        </div>
      )}
      <img
        src={displaySrc}
        alt={alt}
        onError={handleError}
        onLoad={handleLoad}
        loading="lazy"
        className={`${className ?? ''} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        {...props}
      />
    </div>
  );
}

/* CatalogPanel removed — catalog info now shown in bottom overlay */
