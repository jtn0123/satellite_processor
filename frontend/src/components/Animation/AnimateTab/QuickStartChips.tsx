import type { AnimationConfig } from '../types';

interface QuickStartChipsProps {
  readonly onApply: (updates: Partial<AnimationConfig> & { hours?: number }) => void;
  readonly defaultSatellite: string;
}

export function QuickStartChips({ onApply, defaultSatellite }: QuickStartChipsProps) {
  const sat = defaultSatellite || 'GOES-19';
  const chips = [
    { label: '🌀 Hurricane Watch', satellite: sat, sector: 'CONUS', band: 'C13', hours: 24, quality: 'high' as const },
    { label: '🌅 Visible Timelapse', satellite: sat, sector: 'CONUS', band: 'C02', hours: 12, quality: 'medium' as const },
    { label: '⚡ Storm Cell', satellite: sat, sector: 'Meso1', band: 'C13', hours: 3, quality: 'high' as const },
    { label: '🌍 Full Disk', satellite: sat, sector: 'FullDisk', band: 'C13', hours: 6, quality: 'medium' as const },
    { label: '🔥 Fire Watch', satellite: sat, sector: 'CONUS', band: 'C07', hours: 6, quality: 'high' as const },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onApply({ satellite: chip.satellite, sector: chip.sector, band: chip.band, quality: chip.quality, hours: chip.hours })}
          className="min-h-[44px] px-4 py-2 text-sm rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-all border border-gray-200 dark:border-slate-700 hover:border-primary/40"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
