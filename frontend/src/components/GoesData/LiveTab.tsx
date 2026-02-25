import { useState, useEffect, useRef, useCallback, useSyncExternalStore, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Satellite, Maximize2, Minimize2, RefreshCw, Zap, Columns2, Eye, EyeOff, SlidersHorizontal, X } from 'lucide-react';
import axios from 'axios';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useMonitorWebSocket } from '../../hooks/useMonitorWebSocket';
import MonitorSettingsPanel from './MonitorSettingsPanel';
import type { MonitorPreset } from './monitorPresets';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useImageZoom } from '../../hooks/useImageZoom';
import { useDoubleTap } from '../../hooks/useDoubleTap';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import SwipeHint from './SwipeHint';
import ShimmerLoader from './ShimmerLoader';
import BottomSheet from './BottomSheet';
import StaleDataBanner from './StaleDataBanner';
import CompareSlider from './CompareSlider';
import InlineFetchProgress from './InlineFetchProgress';
import { extractArray } from '../../utils/safeData';
import {
  FRIENDLY_BAND_NAMES,
  getFriendlyBandLabel,
  getFriendlyBandName,
  saveCachedImage,
  loadCachedImage,
} from './liveTabUtils';
import BandPillStrip from './BandPillStrip';
import type { CachedImageMeta } from './liveTabUtils';

function subscribeToResize(cb: () => void) {
  globalThis.addEventListener('resize', cb);
  return () => globalThis.removeEventListener('resize', cb);
}
function getIsMobile() { return globalThis.window !== undefined && globalThis.innerWidth < 768; }
function useIsMobile() { return useSyncExternalStore(subscribeToResize, getIsMobile, () => false); }

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

/** Hook: encapsulates monitor mode state + WS-driven refetch */
function useMonitorMode(
  onMonitorChange: ((active: boolean) => void) | undefined,
  satellite: string,
  sector: string,
  band: string,
  refetchRef: React.RefObject<(() => Promise<unknown>) | null>,
) {
  const [monitoring, setMonitoring] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);

  const { lastEvent: wsLastEvent } = useMonitorWebSocket(monitoring, { satellite, sector, band });

  useEffect(() => {
    if (wsLastEvent && monitoring) {
      refetchRef.current?.();
    }
  }, [wsLastEvent, monitoring, refetchRef]);

  const toggleMonitor = useCallback(() => {
    setMonitoring((v) => {
      const next = !v;
      setAutoFetch(next);
      const toastLevel = next ? 'success' : 'info';
      const toastMsg = next ? 'Monitor mode activated' : 'Monitor mode stopped';
      showToast(toastLevel, toastMsg);
      onMonitorChange?.(next);
      return next;
    });
  }, [onMonitorChange]);

  const startMonitorRaw = useCallback((applyConfig: () => void) => {
    applyConfig();
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

  return { monitoring, autoFetch, setAutoFetch, toggleMonitor, startMonitorRaw, stopMonitor };
}

/* useOverlayToggle removed — bottom metadata overlay replaced by StatusPill */

/** Build a direct CDN URL from satellite/sector/band (always available) */
function buildCdnUrl(satellite: string, sector: string, band: string): string | null {
  if (!satellite || !sector || !band) return null;
  // NOAA CDN uses satellite name without hyphen for path, e.g. GOES16
  const satPath = satellite.replace('-', '');
  const resolution = sector === 'FD' ? '1808x1808' : '1250x750';
  return `https://cdn.star.nesdis.noaa.gov/${satPath}/ABI/${sector}/${band}/latest_${resolution}.jpg`;
}

/** Resolve image URLs from local frames and catalog, with responsive mobile fallback */
function resolveImageUrls(
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
  recentFrames: LatestFrame[] | undefined,
  satellite?: string,
  sector?: string,
  band?: string,
) {
  const isMobileView = globalThis.window !== undefined && globalThis.window.innerWidth < 768;
  const catalogImageUrl = (isMobileView ? catalogLatest?.mobile_url : catalogLatest?.image_url) ?? catalogLatest?.image_url ?? null;
  const localImageUrl = frame?.thumbnail_url ?? frame?.image_url ?? null;
  const directCdnUrl = buildCdnUrl(satellite ?? '', sector ?? '', band ?? '');
  const imageUrl = localImageUrl ?? catalogImageUrl ?? directCdnUrl;

  const recentFramesList = extractArray<LatestFrame>(recentFrames);
  const prevFrame = recentFramesList?.[1];
  const prevImageUrl = prevFrame?.thumbnail_url ?? prevFrame?.image_url ?? null;

  return { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl };
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

/* Countdown display hook — extracted to reduce LiveTab cognitive complexity */
function useCountdownDisplay(refreshInterval: number, frame: LatestFrame | undefined) {
  const [countdownSec, setCountdownSec] = useState(Math.floor(refreshInterval / 1000));
   
  useEffect(() => {
    setCountdownSec(Math.floor(refreshInterval / 1000));
  }, [refreshInterval]);
   
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownSec((prev) => (prev <= 1 ? Math.floor(refreshInterval / 1000) : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshInterval, frame]);
  return useMemo(() => {
    const m = Math.floor(countdownSec / 60);
    const s = countdownSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [countdownSec]);
}

/* Swipe-to-change-band hook — extracted to reduce LiveTab cognitive complexity */
function useSwipeBand(products: Product | undefined, band: string, setBand: (b: string) => void) {
  const bandKeys = useMemo(() => {
    if (products?.bands?.length) return products.bands.map((b) => b.id);
    return Object.keys(FRIENDLY_BAND_NAMES);
  }, [products]);

  const [swipeToast, setSwipeToast] = useState<string | null>(null);
  const swipeToastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, isZoomed?: boolean) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (isZoomed) return;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    const currentIdx = bandKeys.indexOf(band);
    if (currentIdx < 0) return;
    const nextIdx = dx < 0 ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx < 0 || nextIdx >= bandKeys.length) return;
    const nextBand = bandKeys[nextIdx];
    setBand(nextBand);
    const label = getFriendlyBandName(nextBand);
    clearTimeout(swipeToastTimer.current);
    setSwipeToast(`${nextBand} — ${label}`);
    swipeToastTimer.current = setTimeout(() => setSwipeToast(null), 2000);
  }, [band, bandKeys, setBand]);

  return { swipeToast, handleTouchStart, handleTouchEnd };
}

function FullscreenButton({ isFullscreen, onClick }: Readonly<{ isFullscreen: boolean; onClick: () => void }>) {
  const label = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
  const Icon = isFullscreen ? Minimize2 : Maximize2;
  return (
    <button onClick={onClick}
      className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px]"
      title={label} aria-label={label}>
      <Icon className="w-4 h-4" />
    </button>
  );
}

function StatusPill({ monitoring, satellite, band, frameTime, isMobile }: Readonly<{ monitoring: boolean; satellite: string; band: string; frameTime: string | null; isMobile?: boolean }>) {
  const dotClass = monitoring ? 'bg-emerald-400' : 'bg-emerald-400/50';
  const age = frameTime ? timeAgo(frameTime) : '';
  return (
    <div className={`absolute z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm ${isMobile ? 'top-2 left-2 bg-black/60' : 'top-16 left-4 bg-black/50'}`} data-testid="status-pill">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass} animate-pulse`} />
      <span className="text-xs font-medium text-white/90">
        {monitoring ? 'MONITORING' : 'LIVE'}
        {satellite && <> · {satellite}</>}
        {band && <> · {band}</>}
        {age && <> · {age}</>}
      </span>
    </div>
  );
}

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

interface LiveTabProps {
  onMonitorChange?: (active: boolean) => void;
}

export default function LiveTab({ onMonitorChange }: Readonly<LiveTabProps> = {}) {
  const isMobile = useIsMobile();

  // #1: Lock scroll on Live tab (mobile only)
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile]);

  const [satellite, setSatellite] = useState('');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('C02');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastAutoFetchTime = useRef<string | null>(null);
  const lastAutoFetchMs = useRef<number>(0);

  const zoom = useImageZoom();

  const refetchRef = useRef<(() => Promise<unknown>) | null>(null);

  const applyMonitorConfig = useCallback((config: { satellite: string; sector: string; band: string; interval: number }) => {
    setSatellite(config.satellite);
    setSector(config.sector);
    setBand(config.band);
    setRefreshInterval(config.interval);
  }, []);

  // Monitor mode: state + WS-driven refetch
  const { monitoring, autoFetch, setAutoFetch, toggleMonitor, startMonitorRaw, stopMonitor } = useMonitorMode(onMonitorChange, satellite, sector, band, refetchRef);

  const startMonitor = useCallback((config: { satellite: string; sector: string; band: string; interval: number }) => {
    startMonitorRaw(() => applyMonitorConfig(config));
  }, [startMonitorRaw, applyMonitorConfig]);

  const applyPreset = useCallback((preset: MonitorPreset) => {
    setSatellite(preset.satellite || satellite);
    setSector(preset.sector);
    setBand(preset.band || band);
    setRefreshInterval(preset.interval);
  }, [satellite, band]);

  // Mobile overlay auto-hide: visible on first load, hides after 3s of inactivity
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetOverlayTimer = useCallback(() => {
    clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 5000);
  }, []);
  useEffect(() => {
    // Auto-hide on initial load
    resetOverlayTimer();
    return () => clearTimeout(overlayTimer.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleOverlay = useCallback(() => {
    setOverlayVisible((v) => {
      const next = !v;
      if (next) resetOverlayTimer();
      return next;
    });
  }, [resetOverlayTimer]);

  // Bottom sheet for mobile pickers
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [sheetFocus, setSheetFocus] = useState<'band' | null>(null);
  const bandPickerRef = useRef<HTMLDivElement>(null);
  const scrollToBandsRef = useRef(false);

  useEffect(() => {
    if (bottomSheetOpen && scrollToBandsRef.current && bandPickerRef.current) {
      bandPickerRef.current.scrollIntoView({ behavior: 'smooth' });
      scrollToBandsRef.current = false;
    }
  }, [bottomSheetOpen]);

  const handlePullRefresh = useCallback(async () => {
    await refetchRef.current?.();
  }, []);

  const { containerRef: pullContainerRef, isRefreshing: isPullRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    enabled: !zoom.isZoomed,
  });

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  /* eslint-disable react-hooks/set-state-in-effect -- intentional init from async data */
  useEffect(() => {
    if (products && !satellite) {
      setSatellite(products.default_satellite || products.satellites?.[0] || 'GOES-16');
    }
  }, [products, satellite]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
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

  // Auto-refresh countdown (#12)
  const countdownDisplay = useCountdownDisplay(refreshInterval, frame);

  // Swipe gestures (#10)
  const { swipeToast, handleTouchStart, handleTouchEnd } = useSwipeBand(products, band, setBand);

  const { activeJobId, activeJob, fetchNow } = useLiveFetchJob({
    satellite, sector, band, autoFetch, catalogLatest: catalogLatest ?? null,
    frame: frame ?? null, lastAutoFetchTimeRef: lastAutoFetchTime, lastAutoFetchMsRef: lastAutoFetchMs, refetch,
  });

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    await (isCurrentlyFullscreen ? exitFullscreenSafe() : enterFullscreenSafe(containerRef.current));
    setIsFullscreen(!isCurrentlyFullscreen);
  }, []);

  useFullscreenSync(setIsFullscreen, zoom);

  // Double-tap zoom vs single-tap overlay toggle (mobile only)
  const handleImageTap = useDoubleTap(
    () => { if (isMobile) toggleOverlay(); },
    () => { if (zoom.isZoomed) { zoom.reset(); } else { zoom.zoomIn(); } },
    300,
  );

  // Reset zoom when satellite/sector/band changes
  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom]);

  // Primary: local frame if available; fallback: catalog CDN URL (responsive)
  const { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl } = resolveImageUrls(catalogLatest, frame, recentFrames, satellite, sector, band);

  const freshnessInfo = computeFreshness(catalogLatest, frame);

  return (
    <div ref={pullContainerRef} className="relative md:h-[calc(100dvh-4rem)] max-md:h-[100dvh] flex flex-col bg-black max-md:-mx-4 max-md:px-0">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isPullRefreshing} />

      {/* Full-bleed image area */}
      <div
        ref={containerRef}
        data-testid="live-image-area"
        className={`relative flex-1 flex items-center justify-center overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
      >
        {/* Swipe hint (first visit only) */}
        {isMobile && <SwipeHint availableBands={products?.bands?.length} isZoomed={zoom.isZoomed} />}

        {/* Swipe gesture area */}
        <button
          type="button"
          className="w-full h-full flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-default appearance-none"
          data-testid="swipe-gesture-area"
          onWheel={compareMode ? undefined : zoom.handlers.onWheel}
          onTouchStart={(e) => {
            if (!compareMode) { zoom.handlers.onTouchStart(e); }
            handleTouchStart(e);
          }}
          onTouchMove={compareMode ? undefined : zoom.handlers.onTouchMove}
          onTouchEnd={(e) => {
            if (!compareMode) { zoom.handlers.onTouchEnd(e); }
            handleTouchEnd(e, zoom.isZoomed);
          }}
          onMouseDown={compareMode ? undefined : zoom.handlers.onMouseDown}
          onMouseMove={compareMode ? undefined : zoom.handlers.onMouseMove}
          onMouseUp={compareMode ? undefined : zoom.handlers.onMouseUp}
          onClick={handleImageTap}
        >
          <ImagePanelContent
            isLoading={isLoading && !catalogImageUrl}
            isError={isError && !imageUrl}
            imageUrl={imageUrl}
            compareMode={compareMode}
            satellite={satellite}
            band={band}
            sector={sector}
            zoomStyle={zoom.style}
            prevImageUrl={prevImageUrl}
            comparePosition={comparePosition}
            onPositionChange={setComparePosition}
            frameTime={frame?.capture_time ?? null}
            prevFrameTime={prevFrame?.capture_time ?? null}
          />
        </button>

        {/* Swipe toast */}
        {swipeToast && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-md text-white text-sm font-medium pointer-events-none">
            {swipeToast}
          </div>
        )}

        {/* Top controls overlay — on mobile, hidden unless overlayVisible */}
        <div className={`absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none transition-opacity duration-300 ${isMobile && !overlayVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} data-testid="controls-overlay">
          <div className="pointer-events-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-2 px-4 py-3" onClick={() => { if (isMobile) resetOverlayTimer(); }}>
            {/* On mobile, hide dropdowns — use bottom sheet instead */}
            <select id="live-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)} aria-label="Satellite"
              className="max-sm:hidden rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.satellites ?? []).map((s) => (
                <option key={s} value={s} className="bg-space-900 text-white">{getSatelliteLabel(s, products?.satellite_availability)}</option>
              ))}
            </select>
            <select id="live-sector" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"
              className="max-sm:hidden rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.sectors ?? []).map((s) => {
                const unavailable = isSectorUnavailable(s.id, availability?.available_sectors);
                const label = unavailable ? `${s.name} (unavailable)` : s.name;
                return <option key={s.id} value={s.id} disabled={unavailable} className="bg-space-900 text-white">{label}</option>;
              })}
            </select>
            <select id="live-band" value={band} onChange={(e) => setBand(e.target.value)} aria-label="Band"
              className="max-sm:hidden rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm px-3 py-1.5 focus:ring-2 focus:ring-primary/50 focus:outline-hidden transition-colors hover:bg-white/20">
              {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id} className="bg-space-900 text-white" title={getFriendlyBandLabel(b.id, b.description, 'long')}>{getFriendlyBandLabel(b.id, b.description, isMobile ? 'short' : 'medium')}</option>)}
            </select>
            <DesktopControlsBar
              monitoring={monitoring}
              onToggleMonitor={toggleMonitor}
              autoFetch={autoFetch}
              onAutoFetchChange={setAutoFetch}
              refreshInterval={refreshInterval}
              onRefreshIntervalChange={setRefreshInterval}
              compareMode={compareMode}
              onCompareModeChange={setCompareMode}
            />

            <div className="col-span-2 sm:col-span-1 sm:ml-auto flex items-center gap-2 justify-end flex-shrink-0">
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
                className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] relative overflow-hidden"
                title="Refresh now" aria-label="Refresh now">
                <RefreshCw className="w-4 h-4" />
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-white/50 text-center w-full">Next: {countdownDisplay}</span>
              </button>
              <FullscreenButton isFullscreen={isFullscreen} onClick={toggleFullscreen} />
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

        {/* Status pill overlay — positioned on image */}
        <StatusPill monitoring={monitoring} satellite={satellite} band={band} frameTime={frame?.capture_time ?? catalogLatest?.scan_time ?? null} isMobile={isMobile} />

        {/* Mobile FAB for controls — overlaid on image bottom-right */}
        <div className="sm:hidden absolute bottom-24 right-4 z-20 flex flex-col items-center gap-1" data-testid="mobile-fab">
          <MobileControlsFab
            monitoring={monitoring}
            onToggleMonitor={toggleMonitor}
            autoFetch={autoFetch}
            onAutoFetchChange={setAutoFetch}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            onOpenSheet={() => setBottomSheetOpen(true)}
            onOpenBandSheet={() => { scrollToBandsRef.current = true; setBottomSheetOpen(true); }}
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

      {/* Mobile bottom sheet for pickers */}
      <BottomSheet open={bottomSheetOpen} onClose={() => { setBottomSheetOpen(false); setSheetFocus(null); }} title="Settings">
        <div className="flex flex-col gap-4">
          <PickerRow label="Satellite" value={satellite}>
            <div className="flex flex-wrap gap-2 mt-2">
              {(products?.satellites ?? []).map((s) => (
                <button key={s} onClick={() => { setSatellite(s); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${satellite === s ? 'bg-primary/20 border border-primary/50 text-primary' : 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20'}`}>
                  {getSatelliteLabel(s, products?.satellite_availability)}
                </button>
              ))}
            </div>
          </PickerRow>
          <PickerRow label="Sector" value={sector}>
            <div className="flex flex-wrap gap-2 mt-2">
              {(products?.sectors ?? []).map((s) => {
                const unavailable = isSectorUnavailable(s.id, availability?.available_sectors);
                return (
                  <button key={s.id} disabled={unavailable} onClick={() => { setSector(s.id); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${unavailable ? 'opacity-30 cursor-not-allowed' : ''} ${sector === s.id ? 'bg-primary/20 border border-primary/50 text-primary' : 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20'}`}>
                    {s.name}
                  </button>
                );
              })}
            </div>
          </PickerRow>
          <div ref={bandPickerRef}>
          <PickerRow label="Band" value={getFriendlyBandName(band)} defaultExpanded={sheetFocus === 'band' || sheetFocus === null}>
            <div className="flex flex-wrap gap-2 mt-2">
              {(products?.bands ?? []).map((b) => (
                <button key={b.id} onClick={() => { setBand(b.id); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${band === b.id ? 'bg-primary/20 border border-primary/50 text-primary' : 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20'}`}>
                  {getFriendlyBandLabel(b.id, b.description, 'short')}
                </button>
              ))}
            </div>
          </PickerRow>
          </div>
        </div>
      </BottomSheet>

      {/* Mobile band pill strip — pinned above bottom nav */}
      {isMobile && products?.bands && (
        <BandPillStrip
          bands={products.bands}
          activeBand={band}
          onBandChange={setBand}
          satellite={satellite}
          sector={sector}
          satellites={products?.satellites ?? []}
          sectors={(products?.sectors ?? []).map((s) => ({ id: s.id, name: s.name }))}
          onSatelliteChange={setSatellite}
          onSectorChange={setSector}
          sectorName={products.sectors?.find((s) => s.id === sector)?.name}
          satelliteAvailability={products.satellite_availability}
        />
      )}
    </div>
  );
}

/** Expandable picker row for bottom sheet */
function PickerRow({ label, value, children, defaultExpanded = false }: Readonly<{ label: string; value: string; children: React.ReactNode; defaultExpanded?: boolean }>) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  useEffect(() => { setExpanded(defaultExpanded); }, [defaultExpanded]);
  return (
    <div className="border-b border-white/10 pb-3 last:border-b-0">
      <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between py-2" data-testid={`picker-row-${label.toLowerCase()}`}>
        <span className="text-sm font-medium text-gray-400">{label}</span>
        <span className="text-sm font-semibold text-white">{value}</span>
      </button>
      {expanded && children}
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
  zoomStyle: React.CSSProperties;
  prevImageUrl: string | null;
  comparePosition: number;
  onPositionChange: (pos: number) => void;
  frameTime: string | null;
  prevFrameTime: string | null;
}

/* Floating action button for mobile — shows Watch/Auto-fetch/Compare toggles */
/* Extracted bottom metadata overlay to reduce LiveTab cognitive complexity */
/* Extracted desktop controls bar to reduce LiveTab cognitive complexity */
function DesktopControlsBar({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, refreshInterval, onRefreshIntervalChange, compareMode, onCompareModeChange }: Readonly<{
  monitoring: boolean;
  onToggleMonitor: () => void;
  autoFetch: boolean;
  onAutoFetchChange: React.Dispatch<React.SetStateAction<boolean>>;
  refreshInterval: number;
  onRefreshIntervalChange: (v: number) => void;
  compareMode: boolean;
  onCompareModeChange: React.Dispatch<React.SetStateAction<boolean>>;
}>) {
  return (
    <div className="hidden sm:flex items-center gap-2 ml-2">
      <button
        onClick={onToggleMonitor}
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
      <div className="flex items-center gap-1.5 text-xs text-white/80">
        <button
          type="button"
          role="switch"
          aria-label="Toggle auto-fetch"
          aria-checked={autoFetch}
          onClick={() => onAutoFetchChange((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoFetch ? 'bg-amber-500' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoFetch ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="whitespace-nowrap">Auto-fetch every</span>
        <select
          value={refreshInterval}
          onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
          disabled={!autoFetch}
          aria-label="Auto-fetch interval"
          className={`rounded bg-white/10 border border-white/20 text-white text-xs px-1.5 py-0.5 transition-opacity ${autoFetch ? 'hover:bg-white/20' : 'opacity-40 cursor-not-allowed'}`}
        >
          {REFRESH_INTERVALS.map((ri) => (
            <option key={ri.value} value={ri.value} className="bg-space-900 text-white">{ri.label}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={compareMode}
        onClick={() => onCompareModeChange((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
          compareMode
            ? 'bg-blue-500/20 border border-blue-400/40 text-blue-300 hover:bg-blue-500/30'
            : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20'
        }`}
        title={compareMode ? 'Disable compare' : 'Enable compare'}
      >
        <Columns2 className="w-3.5 h-3.5 text-blue-400" />
        Compare
      </button>
    </div>
  );
}

/* BottomMetadataOverlay removed — NOAA watermark has satellite/band/time info; replaced by StatusPill */

function MobileControlsFab({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, compareMode, onCompareModeChange, onOpenSheet, onOpenBandSheet }: Readonly<{
  monitoring: boolean; onToggleMonitor: () => void;
  autoFetch: boolean; onAutoFetchChange: (v: boolean) => void;
  compareMode: boolean; onCompareModeChange: (v: boolean) => void;
  onOpenSheet?: () => void;
  onOpenBandSheet?: () => void;
}>) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    const handler = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (Date.now() - openedAt.current < 150) return;
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
          <button
            onClick={() => onAutoFetchChange(!autoFetch)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
              autoFetch
                ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                : 'bg-white/10 border border-white/20 text-white/80'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            Auto-fetch
          </button>
          <button
            onClick={() => onCompareModeChange(!compareMode)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
              compareMode
                ? 'bg-blue-500/20 border border-blue-400/40 text-blue-300'
                : 'bg-white/10 border border-white/20 text-white/80'
            }`}
          >
            <Columns2 className="w-4 h-4 text-blue-400" />
            Compare
          </button>
          {onOpenBandSheet && (
            <button
              onClick={() => { onOpenBandSheet(); setOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] bg-white/10 border border-white/20 text-white/80"
              data-testid="open-band-sheet"
            >
              <SlidersHorizontal className="w-4 h-4 text-purple-400" />
              Change Band
            </button>
          )}
          {onOpenSheet && (
            <button
              onClick={() => { onOpenSheet(); setOpen(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] bg-white/10 border border-white/20 text-white/80"
              data-testid="open-picker-sheet"
            >
              <Satellite className="w-4 h-4 text-teal-400" />
              Satellite / Band
            </button>
          )}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
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

function ImagePanelContent({ isLoading, isError, imageUrl, compareMode, satellite, band, sector, zoomStyle, prevImageUrl, comparePosition, onPositionChange, frameTime, prevFrameTime }: Readonly<ImagePanelContentProps>) {
  if (isLoading || (!imageUrl && !isError)) {
    return (
      <div className="w-full h-full flex items-center justify-center" data-testid="loading-shimmer">
        <ShimmerLoader />
      </div>
    );
  }
  if (isError && !imageUrl) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="live-error-state">
        <ShimmerLoader />
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <span className="text-xs text-white/60 font-medium">Image unavailable · Retrying…</span>
        </div>
      </div>
    );
  }
  if (compareMode) {
    return (
      <CompareSlider
        imageUrl={imageUrl ?? ''}
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
      src={imageUrl ?? ''}
      alt={`${satellite} ${band} ${sector}`}
      className="max-w-full max-h-full object-contain select-none"
      style={zoomStyle}
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

function CdnImage({ src, alt, className, ...props }: Readonly<CdnImageProps>) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [cachedMeta, setCachedMeta] = useState<CachedImageMeta | null>(null);
  const [cachedDismissed, setCachedDismissed] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);
  const [prevSrc, setPrevSrc] = useState<string | null>(null);

  // Crossfade: keep previous image while new one loads
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    if (src !== displaySrc) {
      setPrevSrc(displaySrc ?? null);
    }
    setError(false);
    setLoaded(false);
    setUsingCached(false);
    setCachedMeta(null);
    setCachedDismissed(false);
    setDisplaySrc(src);
  }, [src]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dataSatellite = props['data-satellite'];
  const dataBand = props['data-band'];
  const dataSector = props['data-sector'];

  const handleLoad = useCallback(() => {
    setLoaded(true);
    // Clear previous image after crossfade completes
    setTimeout(() => setPrevSrc(null), 350);
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

  // Auto-retry on error after 10 seconds
  useEffect(() => {
    if (!error || !src) return;
    const timer = setTimeout(() => {
      setError(false);
      setLoaded(false);
      setUsingCached(false);
      setCachedMeta(null);
      setCachedDismissed(false);
      const separator = src.includes('?') ? '&' : '?';
      setDisplaySrc(`${src}${separator}_r=${Date.now()}`);
    }, 10000);
    return () => clearTimeout(timer);
  }, [error, src]);

  if (error || !displaySrc) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="cdn-image-error">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-lg" />
        <span className="relative z-10 text-xs text-white/60 font-medium">Image unavailable · Retrying…</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900">
      {/* Cached image banner — inline above image, dismissible */}
      {usingCached && cachedMeta && !cachedDismissed && (
        <div className="w-full flex justify-center px-4 py-1" data-testid="cached-image-banner">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200 text-[11px]">
            <span>Cached image · {new Date(cachedMeta.timestamp).toLocaleString()}</span>
            <button onClick={() => setCachedDismissed(true)} className="p-0.5 hover:bg-white/10 rounded" aria-label="Dismiss cached banner">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      {/* Shimmer placeholder */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-lg" data-testid="image-shimmer" />
      )}
      <div className="relative md:rounded-lg overflow-hidden md:border md:border-white/10 w-full bg-slate-900" style={{ aspectRatio: '5/3' }} data-testid="live-image-container">
        {/* Previous image for crossfade */}
        {prevSrc && (
          <img
            src={prevSrc}
            alt=""
            aria-hidden="true"
            className={`${className ?? ''} absolute inset-0 w-full h-full object-contain md:rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100'}`}
          />
        )}
        <img
          src={displaySrc}
          alt={alt}
          onError={handleError}
          onLoad={handleLoad}
          loading="lazy"
          className={`${className ?? ''} w-full h-full object-contain md:rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          {...props}
        />
      </div>
    </div>
  );
}

/* CatalogPanel removed — catalog info now shown in bottom overlay */
// trigger
