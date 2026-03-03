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
import { isMesoSector } from '../../../utils/sectorHelpers';
import BandPillStrip from '../BandPillStrip';

import { resolveImageUrls, computeFreshness, exitFullscreenSafe, enterFullscreenSafe, buildOuterClassName } from './liveHelpers';
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
    return () => { document.body.style.overflow = ''; };
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

  const zoom = useImageZoom({ containerRef, imageRef });
  const showZoomHint = useZoomHint(zoom.isZoomed);

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

  useEffect(() => {
    if (!products?.bands?.length) return;
    const bandExists = products.bands.some((b) => b.id === band);
    if (!bandExists) {
      setBand(products.bands[0].id);
    }
  }, [products, band]);

  useEffect(() => {
    if (isMesoSector(sector) && band === 'GEOCOLOR') {
      setBand('C02');
    }
  }, [sector, band]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: frame, isLoading, isError, refetch } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () => api.get('/goes/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
  });

  useEffect(() => { refetchRef.current = refetch; }, [refetch]);

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

  const { display: countdownDisplay, resetCountdown } = useCountdownDisplay(refreshInterval);
  useEffect(() => { resetCountdownRef.current = resetCountdown; }, [resetCountdown]);

  const { swipeToast, handleTouchStart, handleTouchEnd } = useSwipeBand(products, band, setBand);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const { activeJobId, activeJob, fetchNow, lastFetchFailed } = useLiveFetchJob({
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

  useLiveShortcuts({
    bands: products?.bands, band, isZoomed: zoom.isZoomed, isFullscreen, monitoring,
    setBand, toggleFullscreen, setCompareMode, toggleMonitor, setLiveAnnouncement,
  });

  const handleImageTap = useDoubleTap(
    () => { if (isMobile) toggleOverlay(); },
    () => { (zoom.isZoomed ? zoom.reset : zoom.zoomIn)(); },
    300,
  );

  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  const isMeso = isMesoSector(sector);
  const { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl } = resolveImageUrls(catalogLatest, frame, recentFrames, satellite, sector, band, isMobile);
  const freshnessInfo = computeFreshness(catalogLatest, frame);
  const isComposite = band === 'GEOCOLOR';

  return (
    <div ref={pullContainerRef} className={buildOuterClassName(zoom.isZoomed)}>
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-a11y-announcer">
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
        liveAnnouncement={liveAnnouncement}
      />

      {isMobile && products?.bands && !zoom.isZoomed && (
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
          disabledBands={isMeso ? ['GEOCOLOR'] : []}
        />
      )}
    </div>
  );
}
