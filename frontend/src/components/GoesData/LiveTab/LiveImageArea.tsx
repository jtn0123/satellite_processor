import type {
  CSSProperties,
  RefObject,
  TouchEvent as ReactTouchEvent,
  WheelEvent,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useState, useEffect } from 'react';
import type { LatestFrame, Product } from '../types';
import ImageErrorBoundary from '../ImageErrorBoundary';
import SwipeHint from '../SwipeHint';
import StaleDataBanner from '../StaleDataBanner';
import InlineFetchProgress from '../InlineFetchProgress';
import StatusPill from '../StatusPill';
import MobileControlsFab from '../MobileControlsFab';
import { isHimawariSatellite } from '../../../utils/sectorHelpers';
import type { SectorOption, BandOption } from '../liveTabUtils';
import type { MonitorPreset } from '../monitorPresets';
import { ImageContent } from './ImageContent';
import { ControlsOverlay } from './ControlsOverlay';
import { BandSelector } from './BandSelector';
import { getAutoFetchDisabledReason } from './liveHelpers';

interface LiveImageAreaProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly imageRef: RefObject<HTMLImageElement | null>;
  readonly isMobile: boolean;
  readonly zoom: {
    isZoomed: boolean;
    scale: number;
    style: CSSProperties;
    reset: () => void;
    zoomIn: () => void;
    handlers: {
      onWheel: (e: WheelEvent) => void;
      onTouchStart: (e: ReactTouchEvent) => void;
      onTouchMove: (e: ReactTouchEvent) => void;
      onTouchEnd: (e: ReactTouchEvent) => void;
      onMouseDown: (e: ReactMouseEvent) => void;
      onMouseMove: (e: ReactMouseEvent) => void;
      onMouseUp: (e: ReactMouseEvent) => void;
    };
  };
  readonly showZoomHint: boolean;
  readonly compareMode: boolean;
  readonly comparePosition: number;
  readonly setComparePosition: (v: number) => void;
  readonly isFullscreen: boolean;
  readonly overlayVisible: boolean;
  readonly resetOverlayTimer: () => void;
  readonly setOverlayVisible: (v: boolean) => void;
  readonly handleImageTap: () => void;
  readonly handleTouchStart: (e: ReactTouchEvent) => void;
  readonly handleTouchEnd: (e: ReactTouchEvent, isZoomed: boolean) => void;
  readonly swipeToast: string | null;
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isComposite: boolean;
  readonly isMeso: boolean;
  readonly imageUrl: string | null;
  readonly catalogImageUrl: string | null;
  readonly localImageUrl: string | null;
  readonly prevImageUrl: string | null;
  readonly frame: LatestFrame | null | undefined;
  readonly prevFrame: LatestFrame | null | undefined;
  readonly monitoring: boolean;
  readonly toggleMonitor: () => void;
  readonly autoFetch: boolean;
  readonly setAutoFetch: (v: boolean) => void;
  readonly refreshInterval: number;
  readonly setRefreshInterval: (v: number) => void;
  readonly setCompareMode: (v: boolean | ((v: boolean) => boolean)) => void;
  readonly products: Product | undefined;
  readonly allSatellites: readonly string[];
  readonly satelliteSectors: readonly SectorOption[];
  readonly satelliteBands: readonly BandOption[];
  readonly disabledBands: readonly string[];
  readonly setSatellite: (v: string) => void;
  readonly setSector: (v: string) => void;
  readonly setBand: (v: string) => void;
  readonly refetch: () => void;
  readonly resetCountdown: () => void;
  readonly countdownDisplay: string;
  readonly toggleFullscreen: () => void;
  readonly startMonitor: (config: {
    satellite: string;
    sector: string;
    band: string;
    interval: number;
  }) => void;
  readonly stopMonitor: () => void;
  readonly applyPreset: (preset: MonitorPreset) => void;
  readonly freshnessInfo: { awsAge: string; localAge: string; behindMin: number } | null;
  readonly activeJobId: string | null;
  readonly activeJob: {
    id: string;
    status: string;
    progress: number;
    status_message: string;
  } | null;
  readonly fetchNow: () => void;
  readonly lastFetchFailed: boolean;
  readonly catalogLatest: { scan_time?: string } | null | undefined;
}

export function LiveImageArea(props: LiveImageAreaProps) {
  const {
    containerRef,
    imageRef,
    isMobile,
    zoom,
    showZoomHint,
    compareMode,
    comparePosition,
    setComparePosition,
    isFullscreen,
    overlayVisible,
    resetOverlayTimer,
    setOverlayVisible,
    handleImageTap,
    handleTouchStart,
    handleTouchEnd,
    swipeToast,
    satellite,
    sector,
    band,
    isLoading,
    isError,
    isComposite,
    isMeso,
    imageUrl,
    catalogImageUrl,
    localImageUrl,
    prevImageUrl,
    frame,
    prevFrame,
    monitoring,
    toggleMonitor,
    autoFetch,
    setAutoFetch,
    refreshInterval,
    setRefreshInterval,
    setCompareMode,
    products,
    allSatellites,
    satelliteSectors,
    satelliteBands,
    disabledBands,
    setSatellite,
    setSector,
    setBand,
    refetch,
    resetCountdown,
    countdownDisplay,
    toggleFullscreen,
    startMonitor,
    stopMonitor,
    applyPreset,
    freshnessInfo,
    activeJobId,
    activeJob,
    fetchNow,
    lastFetchFailed,
    catalogLatest,
  } = props;

  // Himawari staleness: track age from capture_time (no catalogLatest available).
  // nowMs is initialised lazily (Date.now() only runs once per mount) and then
  // refreshed every minute via an interval — never called synchronously in render.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const himawariStaleMin =
    isHimawariSatellite(satellite) && !freshnessInfo && frame?.capture_time && !activeJobId
      ? Math.floor((nowMs - new Date(frame.capture_time).getTime()) / 60000)
      : null;

  // JTN-428: on mobile we let CdnImage take its intrinsic height and
  // vertically-center it in the flex-1 viewport, so landscape-aspect
  // frames no longer cluster at the top of a tall letterboxed area.
  const containerClass = `relative flex-1 flex items-center justify-center ${zoom.isZoomed ? 'overflow-clip' : 'overflow-hidden'}${isFullscreen ? ' fixed inset-0 z-50' : ''}`;

  function handleContainerTouchStart(e: ReactTouchEvent) {
    if (!compareMode) {
      zoom.handlers.onTouchStart(e);
    }
    handleTouchStart(e);
  }

  function handleContainerTouchEnd(e: ReactTouchEvent) {
    if (!compareMode) {
      zoom.handlers.onTouchEnd(e);
    }
    handleTouchEnd(e, zoom.isZoomed);
  }

  function handleContainerMouseMove(e: ReactMouseEvent) {
    if (!compareMode) {
      zoom.handlers.onMouseMove(e);
    }
    if (!isMobile && !overlayVisible) {
      setOverlayVisible(true);
      resetOverlayTimer();
    }
  }

  function handleContainerKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      handleImageTap();
    }
  }

  return (
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
    <div
      ref={containerRef}
      data-testid="live-image-area"
      role="application"
      aria-label="Satellite image viewer — tap to toggle controls, swipe to change band"
      tabIndex={0}
      className={containerClass}
      onWheel={compareMode ? undefined : zoom.handlers.onWheel}
      onTouchStart={handleContainerTouchStart}
      onTouchMove={compareMode ? undefined : zoom.handlers.onTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      onMouseDown={compareMode ? undefined : zoom.handlers.onMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={compareMode ? undefined : zoom.handlers.onMouseUp}
      onClick={handleImageTap}
      onKeyDown={handleContainerKeyDown}
    >
      {isMobile && <SwipeHint availableBands={products?.bands?.length} isZoomed={zoom.isZoomed} />}

      <ImageErrorBoundary key={`${satellite}-${sector}-${band}`}>
        <ImageContent
          imageUrl={imageUrl}
          catalogImageUrl={catalogImageUrl}
          isLoading={isLoading}
          isError={isError}
          isComposite={isComposite}
          satellite={satellite}
          sector={sector}
          band={band}
          products={products}
          activeJobId={activeJobId}
          activeJob={activeJob}
          lastFetchFailed={lastFetchFailed}
          fetchNow={fetchNow}
          compareMode={compareMode}
          prevImageUrl={prevImageUrl}
          comparePosition={comparePosition}
          setComparePosition={setComparePosition}
          frame={frame}
          prevFrame={prevFrame}
          zoom={zoom}
          imageRef={imageRef}
        />
      </ImageErrorBoundary>

      {swipeToast && (
        <div
          aria-live="assertive"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-xl glass-t2 text-white text-sm font-medium pointer-events-none"
        >
          {swipeToast}
        </div>
      )}

      <ControlsOverlay
        overlayVisible={overlayVisible}
        monitoring={monitoring}
        toggleMonitor={toggleMonitor}
        autoFetch={autoFetch}
        setAutoFetch={setAutoFetch}
        refreshInterval={refreshInterval}
        setRefreshInterval={setRefreshInterval}
        compareMode={compareMode}
        setCompareMode={setCompareMode}
        satellite={satellite}
        sector={sector}
        band={band}
        isMeso={isMeso}
        isFullscreen={isFullscreen}
        allSatellites={allSatellites}
        satelliteSectors={satelliteSectors}
        satelliteBands={satelliteBands}
        startMonitor={startMonitor}
        stopMonitor={stopMonitor}
        applyPreset={applyPreset}
        refetch={refetch}
        resetCountdown={resetCountdown}
        countdownDisplay={countdownDisplay}
        toggleFullscreen={toggleFullscreen}
      />

      {!isComposite && freshnessInfo && frame && localImageUrl && !activeJobId && (
        <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
          <StaleDataBanner
            freshnessInfo={freshnessInfo}
            captureTime={frame.capture_time}
            activeJobId={activeJobId}
            onFetchNow={fetchNow}
          />
        </div>
      )}

      {himawariStaleMin != null && himawariStaleMin > 20 && (
        <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-200 text-xs">
            <span>Last fetched: {himawariStaleMin} min ago — data may be stale</span>
            <button
              type="button"
              onClick={fetchNow}
              className="ml-auto underline hover:text-yellow-100 transition-colors"
            >
              Fetch now
            </button>
          </div>
        </div>
      )}

      {activeJobId && activeJob && (imageUrl || !isMeso) && (
        <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
          <InlineFetchProgress job={activeJob} />
        </div>
      )}

      {!zoom.isZoomed && (
        <StatusPill
          monitoring={monitoring}
          satellite={satellite}
          band={band}
          frameTime={frame?.capture_time ?? catalogLatest?.scan_time ?? null}
          isMobile={isMobile}
        />
      )}

      <div
        className={`sm:hidden absolute bottom-24 right-4 z-20 flex flex-col items-center gap-1 ${zoom.isZoomed ? 'hidden' : ''}`}
        data-testid="mobile-fab"
      >
        <MobileControlsFab
          monitoring={monitoring}
          onToggleMonitor={toggleMonitor}
          autoFetch={autoFetch}
          onAutoFetchChange={(v) => setAutoFetch(v)}
          autoFetchDisabled={isHimawariSatellite(satellite) || band === 'GEOCOLOR' || isMeso}
          autoFetchDisabledReason={getAutoFetchDisabledReason(satellite, isMeso)}
        />
      </div>

      {showZoomHint && (
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center pointer-events-none animate-fade-out"
          data-testid="zoom-hint"
        >
          <span className="px-4 py-2 rounded-xl glass-t2 text-white/80 text-sm font-medium">
            Pinch to exit zoom
          </span>
        </div>
      )}

      {zoom.isZoomed && (
        <div className="absolute top-20 right-4 z-10 flex items-center gap-2">
          <span
            className="glass-t2 text-white/70 text-xs font-mono px-2.5 py-1.5 rounded-lg pointer-events-none min-h-[44px] flex items-center"
            aria-live="polite"
            aria-label={`Zoom level ${Math.round(zoom.scale * 100)}%`}
            data-testid="zoom-level-indicator"
          >
            {Math.round(zoom.scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoom.reset}
            className="glass-t1 text-white text-xs px-3 py-1.5 rounded-lg transition-all duration-150 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            Reset zoom
          </button>
        </div>
      )}

      {!isMobile && products?.bands && (
        <BandSelector
          variant="desktop"
          satellite={satellite}
          sector={sector}
          band={band}
          onSatelliteChange={setSatellite}
          onSectorChange={setSector}
          onBandChange={setBand}
          allSatellites={allSatellites}
          satelliteSectors={satelliteSectors}
          satelliteBands={satelliteBands}
          disabledBands={disabledBands}
          satelliteAvailability={products.satellite_availability}
        />
      )}
    </div>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */
  );
}
