import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Download } from 'lucide-react';
import { BAND_INFO } from '../../constants/bands';
import api from '../../api/client';
import { showToast } from '../../utils/toast';

interface BandPickerProps {
  value: string;
  onChange: (band: string) => void;
  satellite?: string;
  sector?: string;
  disabled?: boolean;
}

const BAND_IDS = Object.keys(BAND_INFO);

const GROUPS: { label: string; category: string; bands: string[] }[] = [
  { label: 'Visible', category: 'Visible', bands: ['C01', 'C02'] },
  { label: 'Near-IR', category: 'Near-IR', bands: ['C03', 'C04', 'C05', 'C06'] },
  { label: 'Infrared', category: 'IR', bands: ['C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16'] },
];

const FILTERS: { label: string; bands: string[] }[] = [
  { label: 'All', bands: BAND_IDS },
  { label: 'Weather', bands: ['C02', 'C08', 'C09', 'C10', 'C13', 'C14'] },
  { label: 'Storms', bands: ['C02', 'C07', 'C08', 'C13', 'C14', 'C15'] },
  { label: 'Vegetation', bands: ['C02', 'C03', 'C05', 'C06'] },
];

export default function BandPicker({ value, onChange, satellite, sector, disabled }: Readonly<BandPickerProps>) {
  const [filter, setFilter] = useState('All');
  const [fetchingBand, setFetchingBand] = useState<string | null>(null);

  // Check which bands have local data
  const { data: bandCounts } = useQuery<Record<string, number>>({
    queryKey: ['band-counts', satellite, sector],
    queryFn: () =>
      api.get('/goes/band-availability', { params: { satellite, sector } }).then((r) => r.data?.counts ?? {}),
    enabled: !!satellite && !!sector,
    staleTime: 60000,
  });

  const fetchSample = useCallback((bandId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!satellite || !sector) return;
    setFetchingBand(bandId);
    api.post('/goes/fetch', {
      satellite,
      sector,
      band: bandId,
      hours: 1,
    }).then(() => {
      showToast('success', `Fetching sample for ${bandId}`);
    }).catch(() => {
      showToast('error', `Failed to fetch ${bandId}`);
    }).finally(() => setFetchingBand(null));
  }, [satellite, sector]);

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
            type="button"
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
                    type="button"
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
                    {bandCounts && !bandCounts[bandId] && (
                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-200 dark:border-slate-700">
                        <span className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-slate-500">
                          <ImageOff className="w-3 h-3" />
                          No data yet
                        </span>
                        {satellite && sector && (
                          <button
                            type="button"
                            onClick={(e) => fetchSample(bandId, e)}
                            disabled={fetchingBand === bandId}
                            className="flex items-center gap-0.5 text-[10px] text-primary hover:text-primary/80 disabled:opacity-50"
                            title={`Fetch sample for ${bandId}`}
                          >
                            <Download className="w-3 h-3" />
                            Fetch
                          </button>
                        )}
                      </div>
                    )}
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
