import { useState, useEffect, useRef, useCallback, useSyncExternalStore, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
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
// BottomSheet removed — pill strip handles all pickers
import StaleDataBanner from './StaleDataBanner';
import InlineFetchProgress from './InlineFetchProgress';
import { extractArray } from '../../utils/safeData';
import {
  FRIENDLY_BAND_NAMES,
  getFriendlyBandLabel,
  getFriendlyBandName,
  timeAgo,
} from './liveTabUtils';
import BandPillStrip from './BandPillStrip';
import ImagePanelContent from './ImagePanelContent';
import ImageErrorBoundary from './ImageErrorBoundary';
import MobileControlsFab from './MobileControlsFab';
import DesktopControlsBar from './DesktopControlsBar';
import StatusPill from './StatusPill';
import FullscreenButton from './FullscreenButton';

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

/** Hook: encapsulates monitor mode state + WS-driven refetch */
function useMonitorMode(
  onMonitorChange: ((active: boolean) => void) | undefined,
  satellite: string,
  sector: string,
  band: string,
  refetchRef: React.RefObject<(() => Promise<unknown>) | null>,
  onRefetch?: () => void,
) {
  const [monitoring, setMonitoring] = useState(false);
  const [autoFetch, setAutoFetch] = useState(false);

  const { lastEvent: wsLastEvent } = useMonitorWebSocket(monitoring, { satellite, sector, band });

  useEffect(() => {
    if (wsLastEvent && monitoring) {
      refetchRef.current?.();
      onRefetch?.();
    }
  }, [wsLastEvent, monitoring, refetchRef, onRefetch]);

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

/** Sectors that have CDN pre-rendered images (meso sectors do NOT) */
const CDN_AVAILABLE_SECTORS = new Set(['CONUS', 'FullDisk']);

/** CDN sector path mapping — mirrors backend CDN_SECTOR_MAP (CDN-available sectors only) */
const CDN_SECTOR_PATH: Record<string, string> = {
  CONUS: 'CONUS',
  FullDisk: 'FD',
};

/** CDN resolutions per sector — mirrors backend CDN_RESOLUTIONS */
const CDN_RESOLUTIONS: Record<string, { desktop: string; mobile: string }> = {
  CONUS: { desktop: '2500x1500', mobile: '1250x750' },
  FullDisk: { desktop: '1808x1808', mobile: '1808x1808' },
};

/** Build a direct CDN URL from satellite/sector/band (returns null for meso sectors) */
function buildCdnUrl(satellite: string, sector: string, band: string, isMobile = false): string | null {
  if (!satellite || !sector || !band) return null;
  if (!CDN_AVAILABLE_SECTORS.has(sector)) return null;
  const satPath = satellite.replaceAll('-', '');
  const cdnSector = CDN_SECTOR_PATH[sector];
  if (!cdnSector) return null;
  let cdnBand = band;
  if (band === 'GEOCOLOR') cdnBand = 'GEOCOLOR';
  else if (band.startsWith('C')) cdnBand = band.slice(1);
  const resolutions = CDN_RESOLUTIONS[sector] ?? CDN_RESOLUTIONS.CONUS;
  const resolution = isMobile ? resolutions.mobile : resolutions.desktop;
  return `https://cdn.star.nesdis.noaa.gov/${satPath}/ABI/${cdnSector}/${cdnBand}/${resolution}.jpg`;
}

/** Resolve image URLs from local frames and catalog, with responsive mobile fallback */
function resolveImageUrls(
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
  recentFrames: LatestFrame[] | undefined,
  satellite?: string,
  sector?: string,
  band?: string,
  isMobileView?: boolean,
) {
  const catalogImageUrl = (isMobileView ? catalogLatest?.mobile_url : catalogLatest?.image_url) ?? catalogLatest?.image_url ?? null;
  const localImageUrl = frame?.thumbnail_url ?? frame?.image_url ?? null;
  const directCdnUrl = buildCdnUrl(satellite ?? '', sector ?? '', band ?? '', isMobileView);
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
    if (band === 'GEOCOLOR') return;
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

/* Countdown display hook — target-time approach to avoid drift */
function useCountdownDisplay(refreshInterval: number) {
  const nextRefreshAt = useRef(0);

  // Initialize on first render + reset when interval changes
  useEffect(() => {
    nextRefreshAt.current = Date.now() + refreshInterval;
  }, [refreshInterval]);

  const resetCountdown = useCallback(() => {
    nextRefreshAt.current = Date.now() + refreshInterval;
  }, [refreshInterval]);

  const [display, setDisplay] = useState(() => {
    const sec = Math.max(0, Math.ceil(refreshInterval / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((nextRefreshAt.current - Date.now()) / 1000));
      if (remaining <= 0) {
        nextRefreshAt.current = Date.now() + refreshInterval;
      }
      const m = Math.floor(remaining / 60);
      const s = remaining % 60;
      setDisplay(`${m}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  return { display, resetCountdown };
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

/** Message shown for mesoscale sectors where CDN images are not available */
function MesoFetchRequiredMessage({ onFetchNow }: Readonly<{ onFetchNow: () => void }>) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center p-8">
      <p className="text-white/70 text-sm">No live preview available for mesoscale sectors — CDN images are not provided by NOAA.</p>
      <button
        type="button"
        onClick={onFetchNow}
        className="px-4 py-2 rounded-lg bg-primary/80 hover:bg-primary text-white text-sm font-medium transition-colors"
      >
        Fetch to view
      </button>
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
  const resetCountdownRef = useRef<(() => void) | null>(null);
  const handleRefetchWithCountdown = useCallback(() => {
    resetCountdownRef.current?.();
  }, []);

  const applyMonitorConfig = useCallback((config: { satellite: string; sector: string; band: string; interval: number }) => {
    setSatellite(config.satellite);
    setSector(config.sector);
    setBand(config.band);
    setRefreshInterval(config.interval);
  }, []);

  // Monitor mode: state + WS-driven refetch
  const { monitoring, autoFetch, setAutoFetch, toggleMonitor, startMonitorRaw, stopMonitor } = useMonitorMode(onMonitorChange, satellite, sector, band, refetchRef, handleRefetchWithCountdown);

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

  const handlePullRefresh = useCallback(async () => {
    await refetchRef.current?.();
    resetCountdownRef.current?.();
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

  // Validate band exists in available products — fall back to first available
  useEffect(() => {
    if (!products?.bands?.length) return;
    const bandExists = products.bands.some((b) => b.id === band);
    if (!bandExists) {
      setBand(products.bands[0].id);
    }
  }, [products, band]);
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
  const { display: countdownDisplay, resetCountdown } = useCountdownDisplay(refreshInterval);
  useEffect(() => { resetCountdownRef.current = resetCountdown; }, [resetCountdown]);

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
  const { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl } = resolveImageUrls(catalogLatest, frame, recentFrames, satellite, sector, band, isMobile);

  const freshnessInfo = computeFreshness(catalogLatest, frame);

  return (
    <div ref={pullContainerRef} className="relative md:h-[calc(100dvh-4rem)] max-md:h-[calc(100dvh-140px)] flex flex-col bg-black max-md:-mx-4 max-md:px-0">
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
          aria-label="Satellite image viewer — tap to toggle controls, swipe to change band"
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
          onMouseMove={(e) => {
            if (!compareMode) { zoom.handlers.onMouseMove(e); }
            if (isMobile || overlayVisible) { return; }
            setOverlayVisible(true);
            resetOverlayTimer();
          }}
          onMouseUp={compareMode ? undefined : zoom.handlers.onMouseUp}
          onClick={handleImageTap}
        >
          <ImageErrorBoundary>
            {!imageUrl && !CDN_AVAILABLE_SECTORS.has(sector) && !isLoading ? (
              <MesoFetchRequiredMessage onFetchNow={fetchNow} />
            ) : (
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
            )}
          </ImageErrorBoundary>
        </button>

        {/* Swipe toast */}
        {swipeToast && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-md text-white text-sm font-medium pointer-events-none">
            {swipeToast}
          </div>
        )}

        {/* Top controls overlay — on mobile, hidden unless overlayVisible */}
        <div
          className={`absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none transition-opacity duration-300 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          data-testid="controls-overlay"
        >
          <div className="pointer-events-auto grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-between gap-2 px-4 py-3">
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
              autoFetchDisabled={band === 'GEOCOLOR'}
              autoFetchDisabledReason="Auto-fetch not available for GeoColor — CDN images update automatically"
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
              <button type="button" onClick={() => { refetch(); resetCountdown(); }}
                className="p-2 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white/80 hover:text-white hover:bg-white/20 transition-colors min-h-[44px] min-w-[44px] relative overflow-hidden"
                title="Refresh now" aria-label="Refresh now">
                <RefreshCw className="w-4 h-4" />
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] text-white/50 text-center w-full">Next: {countdownDisplay}</span>
              </button>
              <FullscreenButton isFullscreen={isFullscreen} onClick={toggleFullscreen} />
            </div>
          </div>
        </div>

        {/* Stale data warning overlay — hidden when fetch in progress to avoid overlap */}
        {freshnessInfo && frame && localImageUrl && !activeJobId && (
          <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
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
          <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
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
            autoFetchDisabled={band === 'GEOCOLOR'}
            autoFetchDisabledReason="Auto-fetch not available for GeoColor — CDN images update automatically"
          />
        </div>

        {/* Zoom reset hint */}
        {zoom.isZoomed && (
          <button
            type="button"
            onClick={zoom.reset}
            className="absolute top-20 right-4 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            Reset zoom
          </button>
        )}
      </div>

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

/* CatalogPanel removed — catalog info now shown in bottom overlay */
