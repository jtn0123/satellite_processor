/**
 * JTN-387: Thin BandSelector wrapper around BandPillStrip.
 *
 * Both LiveTab (mobile variant, rendered below the image) and
 * LiveImageArea (desktop variant, rendered inside the image frame)
 * were constructing nearly-identical BandPillStrip calls with awkward
 * array-spread + optional-chaining. This component centralizes the
 * prop shaping so both call sites stay small and consistent.
 *
 * Pure refactor — behavior is identical to the previous inline usage.
 */
import BandPillStrip from '../BandPillStrip';
import type { Product } from '../types';
import type { SectorOption, BandOption } from '../liveTabUtils';

interface BandSelectorProps {
  readonly variant: 'mobile' | 'desktop';
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly onSatelliteChange: (v: string) => void;
  readonly onSectorChange: (v: string) => void;
  readonly onBandChange: (v: string) => void;
  readonly allSatellites: readonly string[];
  readonly satelliteSectors: readonly SectorOption[];
  readonly satelliteBands: readonly BandOption[];
  readonly disabledBands: readonly string[];
  readonly satelliteAvailability?: Product['satellite_availability'];
}

export function BandSelector({
  variant,
  satellite,
  sector,
  band,
  onSatelliteChange,
  onSectorChange,
  onBandChange,
  allSatellites,
  satelliteSectors,
  satelliteBands,
  disabledBands,
  satelliteAvailability,
}: Readonly<BandSelectorProps>) {
  return (
    <BandPillStrip
      variant={variant}
      bands={satelliteBands}
      activeBand={band}
      onBandChange={onBandChange}
      satellite={satellite}
      sector={sector}
      satellites={[...allSatellites]}
      sectors={satelliteSectors.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      }))}
      onSatelliteChange={onSatelliteChange}
      onSectorChange={onSectorChange}
      sectorName={satelliteSectors.find((s) => s.id === sector)?.name}
      satelliteAvailability={satelliteAvailability}
      disabledBands={[...disabledBands]}
    />
  );
}
