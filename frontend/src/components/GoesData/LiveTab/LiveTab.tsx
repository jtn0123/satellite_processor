import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';

import type { MonitorPreset } from '../monitorPresets';
import { usePullToRefresh } from '../../../hooks/usePullToRefresh';
import { useImageZoom } from '../../../hooks/useImageZoom';
import { useDoubleTap } from '../../../hooks/useDoubleTap';
import PullToRefreshIndicator from '../PullToRefreshIndicator';
import type { LatestFrame, CatalogLatest, Product } from '../types';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useMonitorMode } from '../../../hooks/useMonitorMode';
import { useLiveFetchJob } from '../../../hooks/useLiveFetchJob';
import { useCountdownDisplay } from '../../../hooks/useCountdownDisplay';
import { useSwipeBand } from '../../../hooks/useSwipeBand';
import {
  isMesoSector,
  isHimawariSatellite,
  getDefaultSector,
  getDefaultBand,
} from '../../../utils/sectorHelpers';
import BandPillStrip from '../BandPillStrip';
import {
  getSectorsForSatellite,
  getBandsForSatellite,
  isCompositeBand,
  getDisabledBands,
} from '../liveTabUtils';

import {
  resolveImageUrls,
  computeFreshness,
  exitFullscreenSafe,
  enterFullscreenSafe,
  buildOuterClassName,
} from './liveHelpers';
import { isNotFoundError, useZoomHint, useFullscreenSync, useLiveShortcuts } from './useLiveHooks';
import { LiveImageArea } from './LiveImageArea';

interface LiveTabProps {
  onMonitorChange?: (active: boolean) => void;
}

export default function LiveTab({ onMonitorChange }: Readonly<LiveTabProps> = {}) {
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobile]);

  const [satellite, setSatellite] = useState('');
  const [sector, setSector] = useState('CONUS');
  const [band, setBand] = useState('GEOCOLOR');
  const [refreshInterval, setRefreshInterval] = useState(300000);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [comparePosition, setComparePosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const lastAutoFetchTime = useRef<string | null>(null);
  const lastAutoFetchMs = useRef<number>(0);

  const zoom = useImageZoom({ containerRef, imageRef, eliminateLetterbox: true });
  const showZoomHint = useZoomHint(zoom.isZoomed);

  const refetchRef = useRef<(() => Promise<unknown>) | null>(null);
  const resetCountdownRef = useRef<(() => void) | null>(null);
  const handleRefetchWithCountdown = useCallback(() => {
    resetCountdownRef.current?.();
  }, []);

  const applyMonitorConfig = useCallback(
    (config: { satellite: string; sector: string; band: string; interval: number }) => {
      setSatellite(config.satellite);
      setSector(config.sector);
      setBand(config.band);
      setRefreshInterval(config.interval);
    },
    [],
  );

  const { monitoring, autoFetch, setAutoFetch, toggleMonitor, startMonitorRaw, stopMonitor } =
    useMonitorMode(
      onMonitorChange,
      satellite,
      sector,
      band,
      refetchRef,
      handleRefetchWithCountdown,
    );

  const startMonitor = useCallback(
    (config: { satellite: string; sector: string; band: string; interval: number }) => {
      startMonitorRaw(() => applyMonitorConfig(config));
    },
    [startMonitorRaw, applyMonitorConfig],
  );

  const applyPreset = useCallback(
    (preset: MonitorPreset) => {
      setSatellite(preset.satellite || satellite);
      setSector(preset.sector);
      setBand(preset.band || band);
      setRefreshInterval(preset.interval);
    },
    [satellite, band],
  );

  // Mobile overlay auto-hide
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetOverlayTimer = useCallback(() => {
    clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 5000);
  }, []);
  useEffect(() => {
    resetOverlayTimer();
    return () => clearTimeout(overlayTimer.current);
  }, [resetOverlayTimer]);
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

  const {
    containerRef: pullContainerRef,
    isRefreshing: isPullRefreshing,
    pullDistance,
  } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    enabled: !zoom.isZoomed,
  });

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
  });

  /* eslint-disable react-hooks/set-state-in-effect -- intentional init from async data */
  useEffect(() => {
    if (products && !satellite) {
      setSatellite(products.default_satellite || products.satellites?.[0] || 'GOES-16');
    }
  }, [products, satellite]);

  useEffect(() => {
    if (!products?.bands?.length) return;
    // Only validate band against API products for GOES satellites;
    // Himawari bands come from client-side constants and won't be in the API response
    if (isHimawariSatellite(satellite)) return;
    const bandExists = products.bands.some((b) => b.id === band);
    if (!bandExists) {
      setBand(products.bands[0].id);
    }
  }, [products, band, satellite]);

  useEffect(() => {
    if (isMesoSector(sector) && band === 'GEOCOLOR') {
      setBand('C02');
    }
  }, [sector, band]);

  // When satellite changes (user action), reset sector and band to satellite-appropriate defaults.
  // We track whether satellite was set via user action vs API init to avoid resetting on first load.
  const satelliteInitialized = useRef(false);
  useEffect(() => {
    if (!satellite) return;
    if (!satelliteInitialized.current) {
      // First time satellite is set (from API init) — don't reset band/sector
      satelliteInitialized.current = true;
      return;
    }
    // User changed the satellite — reset to defaults for the new satellite
    setSector(getDefaultSector(satellite));
    setBand(getDefaultBand(satellite));
  }, [satellite]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const {
    data: frame,
    isLoading,
    isError,
    refetch,
  } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () =>
      api.get('/satellite/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
  });

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const { data: recentFrames } = useQuery<LatestFrame[]>({
    queryKey: ['goes-frames-compare', satellite, sector, band],
    queryFn: () =>
      api
        .get('/satellite/frames', {
          params: { satellite, sector, band, limit: 2, sort: 'capture_time', order: 'desc' },
        })
        .then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite && compareMode,
  });

  const { data: catalogLatest } = useQuery<CatalogLatest>({
    queryKey: ['goes-catalog-latest-live', satellite, sector, band],
    queryFn: () =>
      api
        .get('/satellite/catalog/latest', { params: { satellite, sector, band } })
        .then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: 1,
  });

  const { display: countdownDisplay, resetCountdown } = useCountdownDisplay(refreshInterval);
  useEffect(() => {
    resetCountdownRef.current = resetCountdown;
  }, [resetCountdown]);

  const { swipeToast, handleTouchStart, handleTouchEnd } = useSwipeBand(
    products,
    band,
    setBand,
    satellite,
  );

  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const { activeJobId, activeJob, fetchNow, lastFetchFailed } = useLiveFetchJob({
    satellite,
    sector,
    band,
    autoFetch,
    catalogLatest: catalogLatest ?? null,
    frame: frame ?? null,
    lastAutoFetchTimeRef: lastAutoFetchTime,
    lastAutoFetchMsRef: lastAutoFetchMs,
    refetch,
  });

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    await (isCurrentlyFullscreen
      ? exitFullscreenSafe()
      : enterFullscreenSafe(containerRef.current));
    setIsFullscreen(!isCurrentlyFullscreen);
  }, []);

  useFullscreenSync(setIsFullscreen, zoom);

  useLiveShortcuts({
    bands: products?.bands,
    band,
    isZoomed: zoom.isZoomed,
    isFullscreen,
    monitoring,
    setBand,
    toggleFullscreen,
    setCompareMode,
    toggleMonitor,
    setLiveAnnouncement,
    zoomIn: zoom.zoomIn,
    zoomOut: zoom.zoomOut,
    zoomReset: zoom.reset,
  });

  const handleImageTap = useDoubleTap(
    () => {
      if (isMobile) toggleOverlay();
    },
    () => {
      (zoom.isZoomed ? zoom.reset : zoom.zoomIn)();
    },
    300,
  );

  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMeso = isMesoSector(sector);
  const { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl } = resolveImageUrls(
    catalogLatest,
    frame,
    recentFrames,
    satellite,
    sector,
    band,
    isMobile,
  );
  const freshnessInfo = computeFreshness(catalogLatest, frame);
  const isComposite = isCompositeBand(band, satellite);

  // Satellite-aware sectors and bands (prefer API data for GOES, use constants for Himawari)
  const apiSectors = products?.sectors?.map((s) => ({ id: s.id, name: s.name }));
  const apiBands = products?.bands?.map((b) => ({ id: b.id, description: b.description }));
  const satelliteSectors = getSectorsForSatellite(satellite, apiSectors);
  const satelliteBands = getBandsForSatellite(satellite, apiBands);
  const disabledBands = getDisabledBands(satellite, sector);

  // Merge Himawari-9 into the satellite list from products if not already present
  const allSatellites = (() => {
    const fromApi = products?.satellites ?? [];
    if (fromApi.includes('Himawari-9')) return fromApi;
    return [...fromApi, 'Himawari-9'];
  })();

  return (
    <div ref={pullContainerRef} className={buildOuterClassName(zoom.isZoomed)}>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="live-a11y-announcer"
      >
        {liveAnnouncement}
      </div>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isPullRefreshing} />

      <LiveImageArea
        containerRef={containerRef}
        imageRef={imageRef}
        isMobile={isMobile}
        zoom={zoom}
        showZoomHint={showZoomHint}
        compareMode={compareMode}
        comparePosition={comparePosition}
        setComparePosition={setComparePosition}
        isFullscreen={isFullscreen}
        overlayVisible={overlayVisible}
        resetOverlayTimer={resetOverlayTimer}
        setOverlayVisible={setOverlayVisible}
        handleImageTap={handleImageTap}
        handleTouchStart={handleTouchStart}
        handleTouchEnd={handleTouchEnd}
        swipeToast={swipeToast}
        satellite={satellite}
        sector={sector}
        band={band}
        isLoading={isLoading}
        isError={isError}
        isComposite={isComposite}
        isMeso={isMeso}
        imageUrl={imageUrl}
        catalogImageUrl={catalogImageUrl}
        localImageUrl={localImageUrl}
        prevImageUrl={prevImageUrl}
        frame={frame}
        prevFrame={prevFrame}
        monitoring={monitoring}
        toggleMonitor={toggleMonitor}
        autoFetch={autoFetch}
        setAutoFetch={setAutoFetch}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        setCompareMode={setCompareMode}
        products={products}
        allSatellites={allSatellites}
        satelliteSectors={satelliteSectors}
        satelliteBands={satelliteBands}
        disabledBands={disabledBands}
        setSatellite={setSatellite}
        setSector={setSector}
        setBand={setBand}
        refetch={refetch}
        resetCountdown={resetCountdown}
        countdownDisplay={countdownDisplay}
        toggleFullscreen={toggleFullscreen}
        startMonitor={startMonitor}
        stopMonitor={stopMonitor}
        applyPreset={applyPreset}
        freshnessInfo={freshnessInfo}
        activeJobId={activeJobId}
        activeJob={activeJob}
        fetchNow={fetchNow}
        lastFetchFailed={lastFetchFailed}
        catalogLatest={catalogLatest}
      />

      {isMobile && products?.bands && !zoom.isZoomed && (
        <BandPillStrip
          bands={satelliteBands}
          activeBand={band}
          onBandChange={setBand}
          satellite={satellite}
          sector={sector}
          satellites={allSatellites}
          sectors={satelliteSectors}
          onSatelliteChange={setSatellite}
          onSectorChange={setSector}
          sectorName={satelliteSectors.find((s) => s.id === sector)?.name}
          satelliteAvailability={products.satellite_availability}
          disabledBands={disabledBands}
        />
      )}
    </div>
  );
}
