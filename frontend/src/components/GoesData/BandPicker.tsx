import { useState, useMemo } from 'react';
import { BAND_INFO, type BandInfo } from '../../constants/bands';

interface BandPickerProps {
  value: string;
  onChange: (band: string) => void;
  disabled?: boolean;
}

const BAND_IDS = Object.keys(BAND_INFO);

const GROUPS: { label: string; category: string; bands: string[] }[] = [
  { label: 'Visible', category: 'Visible', bands: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'] },
  { label: 'Near-IR', category: 'Near-IR', bands: ['C07'] },
  { label: 'Infrared', category: 'IR', bands: ['C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16'] },
];

const FILTERS: { label: string; bands: string[] }[] = [
  { label: 'All', bands: BAND_IDS },
  { label: 'Weather', bands: ['C02', 'C08', 'C09', 'C10', 'C13', 'C14'] },
  { label: 'Storms', bands: ['C02', 'C07', 'C08', 'C13', 'C14', 'C15'] },
  { label: 'Vegetation', bands: ['C02', 'C03', 'C05', 'C06'] },
];

export default function BandPicker({ value, onChange, disabled }: BandPickerProps) {
  const [filter, setFilter] = useState('All');

  const activeBands = useMemo(() => {
    const f = FILTERS.find((x) => x.label === filter);
    return new Set(f ? f.bands : BAND_IDS);
  }, [filter]);

  return (
    <div className="space-y-3">
      {/* Quick filter buttons */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setFilter(f.label)}
            disabled={disabled}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filter === f.label
                ? 'bg-primary/20 border-primary/50 text-primary'
                : 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-primary/30'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Band groups */}
      {GROUPS.map((group) => {
        const visibleBands = group.bands.filter((b) => activeBands.has(b));
        if (visibleBands.length === 0) return null;
        return (
          <div key={group.label}>
            <h4 className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
              {group.label}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {visibleBands.map((bandId) => {
                const info = BAND_INFO[bandId];
                if (!info) return null;
                const selected = value === bandId;
                return (
                  <button
                    key={bandId}
                    onClick={() => onChange(bandId)}
                    disabled={disabled}
                    className={`text-left p-3 rounded-lg border transition-all ${
                      selected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-primary/30'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: info.color }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {bandId}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-gray-700 dark:text-slate-300">
                      {info.name}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-slate-500">
                      {info.wavelength}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 line-clamp-2">
                      {info.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
