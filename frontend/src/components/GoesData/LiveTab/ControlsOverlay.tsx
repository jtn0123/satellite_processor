/**
 * JTN-387: Extract the top controls overlay from LiveImageArea.
 *
 * Wraps DesktopControlsBar + MonitorSettingsPanel + refresh/fullscreen
 * buttons into a single component. Historical context:
 *   JTN-408 ISSUE-011 — the overlay used to auto-hide on desktop too,
 *   silently swallowing clicks on the band picker, sector picker, and
 *   monitor settings popover. We now pin it visible on desktop and
 *   only auto-hide on mobile.
 */
import { RefreshCw } from 'lucide-react';
import DesktopControlsBar from '../DesktopControlsBar';
import MonitorSettingsPanel from '../MonitorSettingsPanel';
import FullscreenButton from '../FullscreenButton';
import type { MonitorPreset } from '../monitorPresets';
import type { SectorOption, BandOption } from '../liveTabUtils';
import { isHimawariSatellite } from '../../../utils/sectorHelpers';
import { getAutoFetchDisabledReason } from './liveHelpers';

interface ControlsOverlayProps {
  readonly overlayVisible: boolean;
  readonly monitoring: boolean;
  readonly toggleMonitor: () => void;
  readonly autoFetch: boolean;
  readonly setAutoFetch: (v: boolean) => void;
  readonly refreshInterval: number;
  readonly setRefreshInterval: (v: number) => void;
  readonly compareMode: boolean;
  readonly setCompareMode: (v: boolean | ((v: boolean) => boolean)) => void;
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly isMeso: boolean;
  readonly isFullscreen: boolean;
  readonly allSatellites: readonly string[];
  readonly satelliteSectors: readonly SectorOption[];
  readonly satelliteBands: readonly BandOption[];
  readonly startMonitor: (config: {
    satellite: string;
    sector: string;
    band: string;
    interval: number;
  }) => void;
  readonly stopMonitor: () => void;
  readonly applyPreset: (preset: MonitorPreset) => void;
  readonly refetch: () => void;
  readonly resetCountdown: () => void;
  readonly countdownDisplay: string;
  readonly toggleFullscreen: () => void;
}

export function ControlsOverlay(props: Readonly<ControlsOverlayProps>) {
  const {
    overlayVisible,
    monitoring,
    toggleMonitor,
    autoFetch,
    setAutoFetch,
    refreshInterval,
    setRefreshInterval,
    compareMode,
    setCompareMode,
    satellite,
    sector,
    band,
    isMeso,
    isFullscreen,
    allSatellites,
    satelliteSectors,
    satelliteBands,
    startMonitor,
    stopMonitor,
    applyPreset,
    refetch,
    resetCountdown,
    countdownDisplay,
    toggleFullscreen,
  } = props;

  const autoFetchDisabled = isHimawariSatellite(satellite) || band === 'GEOCOLOR' || isMeso;
  const autoFetchDisabledReason = getAutoFetchDisabledReason(satellite, isMeso);

  return (
    <div
      className={`absolute top-0 inset-x-0 z-10 bg-gradient-to-b from-black/50 via-black/15 to-transparent transition-opacity duration-300 ${overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
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
          autoFetchDisabled={autoFetchDisabled}
          autoFetchDisabledReason={autoFetchDisabledReason}
        />

        <div className="col-span-2 sm:col-span-1 sm:ml-auto flex items-center gap-1.5 justify-end flex-shrink-0 glass-t2 rounded-xl px-1.5 py-1.5">
          <MonitorSettingsPanel
            isMonitoring={monitoring}
            interval={refreshInterval}
            satellite={satellite}
            sector={sector}
            band={band}
            onStart={startMonitor}
            onStop={stopMonitor}
            onApplyPreset={applyPreset}
            satellites={[...allSatellites]}
            sectors={satelliteSectors.map((s) => ({ id: s.id, name: s.name }))}
            bands={satelliteBands.map((b) => ({ id: b.id, description: b.description }))}
          />
          <button
            type="button"
            onClick={() => {
              refetch();
              resetCountdown();
            }}
            className="p-2 rounded-lg glass-t1 text-white/80 hover:text-white transition-all duration-150 min-h-[44px] min-w-[44px] relative overflow-hidden"
            title="Refresh now"
            aria-label="Refresh now"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-white/50 text-center w-full">
              Next: {countdownDisplay}
            </span>
          </button>
          <FullscreenButton isFullscreen={isFullscreen} onClick={toggleFullscreen} />
        </div>
      </div>
    </div>
  );
}
