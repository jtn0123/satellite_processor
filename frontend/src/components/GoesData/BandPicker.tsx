import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Download } from 'lucide-react';
import { BAND_INFO, HIMAWARI_BAND_INFO, getBandInfoForSatellite } from '../../constants/bands';
import { isHimawariSatellite } from '../../utils/sectorHelpers';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { cn } from '../../utils/cn';
import { filterPillClasses, selectableCardClasses } from '../../styles/variants';

interface BandPickerProps {
  value: string;
  onChange: (band: string) => void;
  satellite?: string;
  sector?: string;
  disabled?: boolean;
}

const GOES_BAND_IDS = Object.keys(BAND_INFO);
const HIMAWARI_BAND_IDS = Object.keys(HIMAWARI_BAND_INFO);

const GOES_GROUPS: { label: string; category: string; bands: string[] }[] = [
  { label: 'Visible', category: 'Visible', bands: ['C01', 'C02'] },
  { label: 'Near-IR', category: 'Near-IR', bands: ['C03', 'C04', 'C05', 'C06'] },
  {
    label: 'Infrared',
    category: 'IR',
    bands: ['C07', 'C08', 'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16'],
  },
];

const HIMAWARI_GROUPS: { label: string; category: string; bands: string[] }[] = [
  { label: 'Visible', category: 'Visible', bands: ['B01', 'B02', 'B03'] },
  { label: 'Near-IR', category: 'Near-IR', bands: ['B04', 'B05', 'B06'] },
  {
    label: 'Infrared',
    category: 'IR',
    bands: ['B07', 'B08', 'B09', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16'],
  },
];

const GOES_FILTERS: { label: string; bands: string[] }[] = [
  { label: 'All', bands: GOES_BAND_IDS },
  { label: 'Weather', bands: ['C02', 'C08', 'C09', 'C10', 'C13', 'C14'] },
  { label: 'Storms', bands: ['C02', 'C07', 'C08', 'C13', 'C14', 'C15'] },
  { label: 'Vegetation', bands: ['C02', 'C03', 'C05', 'C06'] },
];

const HIMAWARI_FILTERS: { label: string; bands: string[] }[] = [
  { label: 'All', bands: HIMAWARI_BAND_IDS },
  { label: 'Weather', bands: ['B03', 'B08', 'B09', 'B10', 'B13', 'B14'] },
  { label: 'Storms', bands: ['B03', 'B07', 'B08', 'B13', 'B14', 'B15'] },
  { label: 'Vegetation', bands: ['B03', 'B04', 'B05', 'B06'] },
];

export default function BandPicker({
  value,
  onChange,
  satellite,
  sector,
  disabled,
}: Readonly<BandPickerProps>) {
  const isHimawari = satellite ? isHimawariSatellite(satellite) : false;
  const bandInfoMap = satellite ? getBandInfoForSatellite(satellite) : BAND_INFO;
  const GROUPS = isHimawari ? HIMAWARI_GROUPS : GOES_GROUPS;
  const FILTERS = isHimawari ? HIMAWARI_FILTERS : GOES_FILTERS;
  const BAND_IDS = isHimawari ? HIMAWARI_BAND_IDS : GOES_BAND_IDS;

  const [filter, setFilter] = useState('All');
  const [fetchingBand, setFetchingBand] = useState<string | null>(null);

  // Check which bands have local data
  const { data: bandCounts } = useQuery<Record<string, number>>({
    queryKey: ['band-counts', satellite, sector],
    queryFn: () =>
      api
        .get('/satellite/band-availability', { params: { satellite, sector } })
        .then((r) => r.data?.counts ?? {}),
    enabled: !!satellite && !!sector,
    staleTime: 60000,
  });

  const fetchSample = useCallback(
    (bandId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!satellite || !sector) return;
      setFetchingBand(bandId);
      api
        .post('/satellite/fetch', {
          satellite,
          sector,
          band: bandId,
          hours: 1,
        })
        .then(() => {
          showToast('success', `Fetching sample for ${bandId}`);
        })
        .catch(() => {
          showToast('error', `Failed to fetch ${bandId}`);
        })
        .finally(() => setFetchingBand(null));
    },
    [satellite, sector],
  );

  const activeBands = useMemo(() => {
    const f = FILTERS.find((x) => x.label === filter);
    return new Set(f ? f.bands : BAND_IDS);
  }, [filter, FILTERS, BAND_IDS]);

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
            className={cn(
              'px-3 py-1 text-xs rounded-full border transition-colors',
              filterPillClasses(filter === f.label),
            )}
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
                const info = bandInfoMap[bandId];
                if (!info) return null;
                const selected = value === bandId;
                // Outer card is a div with role="button" rather than a real
                // <button> so the nested "Fetch sample" control can remain a
                // valid <button> (see JTN-423 — nested <button> in <button>
                // is invalid HTML and breaks keyboard tab order).
                const handleSelect = () => {
                  if (disabled) return;
                  onChange(bandId);
                };
                return (
                  <div
                    key={bandId}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-pressed={selected}
                    aria-disabled={disabled || undefined}
                    onClick={handleSelect}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect();
                      }
                    }}
                    className={cn(
                      'text-left p-3 rounded-lg border transition-all cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/50',
                      selectableCardClasses(selected),
                      disabled && 'opacity-50 cursor-not-allowed',
                    )}
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
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
