import type { CSSProperties, RefObject, TouchEvent as ReactTouchEvent, WheelEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { LatestFrame, Product } from '../types';
import ImageErrorBoundary from '../ImageErrorBoundary';
import ImagePanelContent from '../ImagePanelContent';
import MesoFetchRequiredMessage from '../MesoFetchRequiredMessage';
import SwipeHint from '../SwipeHint';
import StaleDataBanner from '../StaleDataBanner';
import InlineFetchProgress from '../InlineFetchProgress';
import StatusPill from '../StatusPill';
import MobileControlsFab from '../MobileControlsFab';
import FullscreenButton from '../FullscreenButton';
import BandPillStrip from '../BandPillStrip';
import DesktopControlsBar from '../DesktopControlsBar';
import MonitorSettingsPanel from '../MonitorSettingsPanel';
import { RefreshCw } from 'lucide-react';
import type { MonitorPreset } from '../monitorPresets';
import { isMesoSector } from '../../../utils/sectorHelpers';

interface LiveImageAreaProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly imageRef: RefObject<HTMLImageElement | null>;
  readonly isMobile: boolean;
  readonly zoom: {
    isZoomed: boolean;
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
  readonly setSatellite: (v: string) => void;
  readonly setSector: (v: string) => void;
  readonly setBand: (v: string) => void;
  readonly refetch: () => void;
  readonly resetCountdown: () => void;
  readonly countdownDisplay: string;
  readonly toggleFullscreen: () => void;
  readonly startMonitor: (config: { satellite: string; sector: string; band: string; interval: number }) => void;
  readonly stopMonitor: () => void;
  readonly applyPreset: (preset: MonitorPreset) => void;
  readonly freshnessInfo: { awsAge: string; localAge: string; behindMin: number } | null;
  readonly activeJobId: string | null;
  readonly activeJob: { id: string; status: string; progress: number; status_message: string } | null;
  readonly fetchNow: () => void;
  readonly lastFetchFailed: boolean;
  readonly catalogLatest: { scan_time?: string } | null | undefined;
  /** @deprecated kept for backward compat; the a11y announcer lives in LiveTab */
  readonly liveAnnouncement?: string;
}

export function LiveImageArea(props: LiveImageAreaProps) {
  const {
    containerRef, imageRef, isMobile, zoom, showZoomHint,
    compareMode, comparePosition, setComparePosition,
    isFullscreen, overlayVisible, resetOverlayTimer, setOverlayVisible,
    handleImageTap, handleTouchStart, handleTouchEnd,
    swipeToast, satellite, sector, band,
    isLoading, isError, isComposite, isMeso,
    imageUrl, catalogImageUrl, localImageUrl, prevImageUrl,
    frame, prevFrame, monitoring, toggleMonitor,
    autoFetch, setAutoFetch, refreshInterval, setRefreshInterval,
    setCompareMode, products, setSatellite, setSector, setBand,
    refetch, resetCountdown, countdownDisplay, toggleFullscreen,
    startMonitor, stopMonitor, applyPreset,
    freshnessInfo, activeJobId, activeJob, fetchNow, lastFetchFailed,
    catalogLatest,
  } = props;

  return (
    <div
      ref={containerRef}
      data-testid="live-image-area"
      role="application"
      aria-label="Satellite image viewer — tap to toggle controls, swipe to change band"
      tabIndex={0}
      className={`relative flex-1 ${zoom.isZoomed ? 'overflow-clip' : 'overflow-hidden'}${isFullscreen ? ' fixed inset-0 z-50' : ''}`}
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
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleImageTap(); } }}
    >
      {isMobile && <SwipeHint availableBands={products?.bands?.length} isZoomed={zoom.isZoomed} />}

      <ImageErrorBoundary key={`${satellite}-${sector}-${band}`}>
        {(() => {
          const isCdnUnavailable = !imageUrl && products?.sectors?.find((s) => s.id === sector)?.cdn_available === false && !isLoading;
          if (isCdnUnavailable && isComposite) {
            return (
              <div className="flex flex-col items-center justify-center gap-4 text-center p-8" data-testid="geocolor-meso-message">
                <p className="text-white/70 text-sm">GEOCOLOR is only available via CDN for CONUS and Full Disk sectors. Select a different band to fetch mesoscale data.</p>
              </div>
            );
          }
          if (isCdnUnavailable) {
            return <MesoFetchRequiredMessage onFetchNow={fetchNow} isFetching={!!activeJobId} fetchFailed={lastFetchFailed} errorMessage={activeJob?.status === 'failed' ? activeJob.status_message : null} />;
          }
          return (
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
              isZoomed={zoom.isZoomed}
              imageRef={imageRef}
            />
          );
        })()}
      </ImageErrorBoundary>

      {swipeToast && (
        <div aria-live="assertive" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-4 py-2 rounded-lg bg-black/70 backdrop-blur-md text-white text-sm font-medium pointer-events-none">
          {swipeToast}
        </div>
      )}

      <div
        className={`absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none transition-opacity duration-300 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        data-testid="controls-overlay"
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <DesktopControlsBar
            monitoring={monitoring}
            onToggleMonitor={toggleMonitor}
            autoFetch={autoFetch}
            onAutoFetchChange={(v) => setAutoFetch(v)}
            refreshInterval={refreshInterval}
            onRefreshIntervalChange={setRefreshInterval}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            autoFetchDisabled={band === 'GEOCOLOR' || isMeso}
            autoFetchDisabledReason={isMeso ? 'Auto-fetch not available for mesoscale sectors' : 'Auto-fetch not available for GeoColor — CDN images update automatically'}
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

      {activeJobId && activeJob && (imageUrl || !isMeso) && (
        <div className="absolute max-sm:top-16 sm:top-28 inset-x-4 z-10">
          <InlineFetchProgress job={activeJob} />
        </div>
      )}

      {!zoom.isZoomed && <StatusPill monitoring={monitoring} satellite={satellite} band={band} frameTime={frame?.capture_time ?? catalogLatest?.scan_time ?? null} isMobile={isMobile} />}

      <div className={`sm:hidden absolute bottom-24 right-4 z-20 flex flex-col items-center gap-1 ${zoom.isZoomed ? 'hidden' : ''}`} data-testid="mobile-fab">
        <MobileControlsFab
          monitoring={monitoring}
          onToggleMonitor={toggleMonitor}
          autoFetch={autoFetch}
          onAutoFetchChange={(v) => setAutoFetch(v)}
          autoFetchDisabled={band === 'GEOCOLOR' || isMeso}
          autoFetchDisabledReason={isMeso ? 'Auto-fetch not available for mesoscale sectors' : 'Auto-fetch not available for GeoColor — CDN images update automatically'}
        />
      </div>

      {showZoomHint && (
        <div
          className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex justify-center pointer-events-none animate-fade-out"
          data-testid="zoom-hint"
        >
          <span className="px-4 py-2 rounded-lg bg-black/60 backdrop-blur-md text-white/80 text-sm font-medium">
            Pinch to exit zoom
          </span>
        </div>
      )}

      {zoom.isZoomed && (
        <button
          type="button"
          onClick={zoom.reset}
          className="absolute top-20 right-4 z-10 bg-black/60 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          Reset zoom
        </button>
      )}

      {!isMobile && products?.bands && (
        <BandPillStrip
          variant="desktop"
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
          disabledBands={isMesoSector(sector) ? ['GEOCOLOR'] : []}
        />
      )}
    </div>
  );
}
