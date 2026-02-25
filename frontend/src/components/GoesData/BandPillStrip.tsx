import { useRef, useEffect, useCallback, useState } from 'react';
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
  satellites: ReadonlyArray<string>;
  sectors: ReadonlyArray<Readonly<{ id: string; name: string }>>;
  onSatelliteChange: (sat: string) => void;
  onSectorChange: (sector: string) => void;
  sectorName?: string;
  satelliteAvailability?: Readonly<Record<string, SatelliteAvailabilityInfo>>;
}

export default function BandPillStrip({
  bands,
  activeBand,
  onBandChange,
  satellite,
  sector,
  satellites,
  sectors,
  onSatelliteChange,
  onSectorChange,
  sectorName,
  satelliteAvailability,
}: Readonly<BandPillStripProps>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [expandedGroup, setExpandedGroup] = useState<'satellite' | 'sector' | null>(null);

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

  const handleSatelliteChipClick = useCallback(() => {
    setExpandedGroup((prev) => (prev === 'satellite' ? null : 'satellite'));
  }, []);

  const handleSectorChipClick = useCallback(() => {
    setExpandedGroup((prev) => (prev === 'sector' ? null : 'sector'));
  }, []);

  const handleSatelliteOption = useCallback(
    (sat: string) => {
      if (sat === satellite) {
        setExpandedGroup(null);
      } else {
        onSatelliteChange(sat);
        setExpandedGroup(null);
      }
    },
    [satellite, onSatelliteChange],
  );

  const handleSectorOption = useCallback(
    (sectorId: string) => {
      if (sectorId === sector) {
        setExpandedGroup(null);
      } else {
        onSectorChange(sectorId);
        setExpandedGroup(null);
      }
    },
    [sector, onSectorChange],
  );

  const satStatus = satelliteAvailability?.[satellite]?.status;
  const satLabel = satStatus && satStatus !== 'operational' ? `${satellite} (${satStatus})` : satellite;

  const activePillClass = 'bg-primary/20 border border-primary/50 text-primary font-semibold';
  const inactivePillClass = 'bg-white/10 border border-white/20 text-white/70 hover:bg-white/20';

  return (
    <div
      className="fixed bottom-16 left-0 right-0 z-20 bg-black/70 backdrop-blur-md border-t border-white/10 sm:hidden"
      data-testid="band-pill-strip"
    >
      {/* Top row: satellite + sector chips (or expanded options) */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1 overflow-x-auto scrollbar-hide transition-all duration-200">
        {expandedGroup === null && (
          <>
            <button
              onClick={handleSatelliteChipClick}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors shrink-0"
              data-testid="pill-strip-satellite"
            >
              {satLabel} ▾
            </button>
            <button
              onClick={handleSectorChipClick}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white/80 text-xs font-medium hover:bg-white/20 transition-colors shrink-0"
              data-testid="pill-strip-sector"
            >
              {sectorName ?? sector} ▾
            </button>
          </>
        )}

        {expandedGroup === 'satellite' &&
          satellites.map((sat) => {
            const isActive = sat === satellite;
            return (
              <button
                key={sat}
                onClick={() => handleSatelliteOption(sat)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive ? activePillClass : inactivePillClass
                }`}
                data-testid={`satellite-option-${sat}`}
              >
                {isActive ? `${sat} ✓` : sat}
              </button>
            );
          })}

        {expandedGroup === 'sector' &&
          sectors.map((s) => {
            const isActive = s.id === sector;
            return (
              <button
                key={s.id}
                onClick={() => handleSectorOption(s.id)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive ? activePillClass : inactivePillClass
                }`}
                data-testid={`sector-option-${s.id}`}
              >
                {isActive ? `${s.name} ✓` : s.name}
              </button>
            );
          })}
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
