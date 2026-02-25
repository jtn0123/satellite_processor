import { useRef, useEffect, useCallback } from 'react';
import { getFriendlyBandLabel } from './liveTabUtils';

interface Band {
  id: string;
  description: string;
}

interface SatelliteAvailabilityInfo {
  status: string;
  description: string;
}

interface BandPillStripProps {
  bands: ReadonlyArray<Band>;
  activeBand: string;
  onBandChange: (bandId: string) => void;
  satellite: string;
  sector: string;
  onSatelliteClick: () => void;
  onSectorClick: () => void;
  sectorName?: string;
  satelliteAvailability?: Readonly<Record<string, SatelliteAvailabilityInfo>>;
}

export default function BandPillStrip({
  bands,
  activeBand,
  onBandChange,
  satellite,
  sector,
  onSatelliteClick,
  onSectorClick,
  sectorName,
  satelliteAvailability,
}: Readonly<BandPillStripProps>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active pill into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center' });
  }, [activeBand]);

  const handleBandClick = useCallback(
    (bandId: string) => {
      onBandChange(bandId);
    },
    [onBandChange],
  );

  const satStatus = satelliteAvailability?.[satellite]?.status;
  const satLabel = satStatus && satStatus !== 'operational' ? `${satellite} (${satStatus})` : satellite;

  return (
    <div
      className="fixed bottom-16 left-0 right-0 z-20 bg-black/70 backdrop-blur-md border-t border-white/10 sm:hidden"
      data-testid="band-pill-strip"
    >
      {/* Top row: satellite + sector chips */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1">
        <button
          onClick={onSatelliteClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors"
          data-testid="pill-strip-satellite"
        >
          {satLabel} ▾
        </button>
        <button
          onClick={onSectorClick}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors"
          data-testid="pill-strip-sector"
        >
          {sectorName ?? sector} ▾
        </button>
      </div>

      {/* Bottom row: scrollable band pills */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 px-3 pb-2 pt-1 overflow-x-auto scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {bands.map((b) => {
          const isActive = b.id === activeBand;
          return (
            <button
              key={b.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => handleBandClick(b.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary/20 border border-primary/50 text-primary font-semibold'
                  : 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20'
              }`}
              style={{ scrollSnapAlign: 'center' }}
              data-testid={`band-pill-${b.id}`}
            >
              {getFriendlyBandLabel(b.id, b.description, 'short')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
