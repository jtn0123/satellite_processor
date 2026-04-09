import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, ChevronLeft, Download } from 'lucide-react';
import api from '../../../api/client';
import { DateTimeField } from '../../ui/DateTimeField';
import type { SatelliteAvailability } from '../types';
import { formatAvailRange, isDateInRange } from './fetchUtils';

interface CatalogEntry {
  scan_time: string;
  size: number;
  key: string;
}

interface WhenStepProps {
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly imageType: 'single' | 'true_color' | 'natural_color';
  readonly startTime: string;
  readonly setStartTime: (v: string) => void;
  readonly endTime: string;
  readonly setEndTime: (v: string) => void;
  readonly currentAvail: SatelliteAvailability | undefined;
  readonly sectorInfo: { cadence_minutes?: number; typical_file_size_kb?: number } | undefined;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
}

export function WhenStep({
  satellite,
  sector,
  band,
  imageType,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  currentAvail,
  sectorInfo,
  onBack,
  onConfirm,
}: WhenStepProps) {
  const dateStr = startTime ? startTime.slice(0, 10) : undefined;

  const { data: catalogData, isFetching: catalogFetching } = useQuery<CatalogEntry[]>({
    queryKey: ['goes-catalog', satellite, sector, band, dateStr],
    queryFn: () =>
      api
        .get('/satellite/catalog', { params: { satellite, sector, band, date: dateStr } })
        .then((r) => r.data),
    enabled: !!dateStr,
    staleTime: 300000,
  });

  const dateWarning = useMemo(() => {
    if (startTime && endTime && new Date(startTime).getTime() >= new Date(endTime).getTime())
      return 'Start time must be before end time';
    if (!currentAvail) return null;
    if (startTime && !isDateInRange(startTime, currentAvail))
      return `Start time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    if (endTime && !isDateInRange(endTime, currentAvail))
      return `End time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    return null;
  }, [startTime, endTime, currentAvail, satellite]);

  const cadence = sectorInfo?.cadence_minutes ?? 10;
  const fileSizeKb = sectorInfo?.typical_file_size_kb ?? 4000;
  const bandCount = imageType === 'single' ? 1 : 3;

  const estimate = useMemo(() => {
    if (!startTime || !endTime) return null;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
    const durationMin = (endMs - startMs) / 60000;
    if (durationMin <= 0) return null;
    const frames = Math.ceil(durationMin / cadence) * bandCount;
    const sizeMb = ((frames * fileSizeKb) / 1000).toFixed(0);
    return { frames, sizeMb };
  }, [startTime, endTime, cadence, fileSizeKb, bandCount]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">When</h2>

      {currentAvail && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 shrink-0" />
          {satellite} available:{' '}
          <span className="text-gray-900 dark:text-white font-medium">
            {formatAvailRange(currentAvail)}
          </span>
        </div>
      )}

      {/* Quick presets */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'Last Hour', hours: 1 },
          { label: 'Last 6h', hours: 6 },
          { label: 'Last 12h', hours: 12 },
          { label: 'Last 24h', hours: 24 },
        ].map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const now = new Date();
              const start = new Date(now.getTime() - preset.hours * 3600000);
              const fmt = (d: Date) => d.toISOString().slice(0, 16);
              setStartTime(fmt(start));
              setEndTime(fmt(now));
            }}
            className="px-4 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary border border-gray-200 dark:border-slate-700 hover:border-primary/30 transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateTimeField
          id="goes-start"
          label="Start date and time"
          value={startTime}
          onChange={setStartTime}
        />
        <DateTimeField
          id="goes-end"
          label="End date and time"
          value={endTime}
          onChange={setEndTime}
        />
      </div>

      {dateWarning && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {dateWarning}
        </div>
      )}

      {/* Catalog timeline */}
      {catalogFetching && (
        <div className="text-xs text-gray-400 animate-pulse">Loading available frames...</div>
      )}
      {catalogData && catalogData.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3">
          <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
            {catalogData.length} frames available on S3
          </div>
          <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
            {catalogData.slice(0, 100).map((entry) => (
              <div
                key={entry.key || entry.scan_time}
                className="h-full bg-emerald-500/60 border-r border-gray-200 dark:border-slate-700"
                style={{ width: `${100 / Math.min(catalogData.length, 100)}%` }}
                title={new Date(entry.scan_time).toLocaleTimeString()}
              />
            ))}
          </div>
        </div>
      )}

      {/* Estimate */}
      {estimate && (
        <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-slate-300">
            ~{estimate.frames} frames · ~{estimate.sizeMb} MB
          </div>
          {estimate.frames > 150 && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Large fetch
            </span>
          )}
        </div>
      )}

      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!startTime || !endTime || !!dateWarning}
          className="flex items-center gap-2 px-6 py-2.5 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          <Download className="w-4 h-4" />
          Fetch
        </button>
      </div>
    </div>
  );
}
