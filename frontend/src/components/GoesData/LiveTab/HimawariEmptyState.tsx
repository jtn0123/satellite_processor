import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Satellite } from 'lucide-react';
import api from '../../../api/client';
import { timeAgo } from '../liveTabUtils';

interface CatalogLatestEntry {
  scan_time: string;
  s3_key?: string;
}

type ScheduleStatus = 'idle' | 'loading' | 'success' | 'error';

interface HimawariEmptyStateProps {
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly activeJobId: string | null;
  readonly fetchNow: () => void;
}

export default function HimawariEmptyState({
  satellite,
  sector,
  band,
  activeJobId,
  fetchNow,
}: HimawariEmptyStateProps) {
  const navigate = useNavigate();
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>('idle');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const { data: s3Latest } = useQuery<CatalogLatestEntry | null>({
    queryKey: ['himawari-s3-latest', satellite, sector, band],
    queryFn: () =>
      api
        .get('/satellite/catalog/latest', { params: { satellite, sector, band } })
        .then((r) => r.data)
        .catch(() => null),
    refetchInterval: 60_000,
    retry: 1,
    staleTime: 30_000,
  });

  const handleScheduleAutoFetch = useCallback(async () => {
    setScheduleStatus('loading');
    setScheduleError(null);
    try {
      const presetRes = await api.post('/satellite/fetch-presets', {
        name: `Himawari Auto-fetch (${sector}/${band})`,
        satellite,
        sector,
        band,
        description: `Auto-created preset for ${satellite} ${sector} ${band}`,
      });
      const presetId: string = presetRes.data.id;

      await api.post('/satellite/schedules', {
        name: `Himawari ${sector}/${band} every 10min`,
        preset_id: presetId,
        interval_minutes: 10,
        is_active: true,
      });

      setScheduleStatus('success');
    } catch (err: unknown) {
      setScheduleStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to create schedule';
      setScheduleError(message);
    }
  }, [satellite, sector, band]);

  return (
    <div
      className="flex flex-col items-center justify-center gap-6 text-center p-8 h-full"
      data-testid="himawari-no-preview"
    >
      <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Satellite className="w-8 h-8 text-primary/70" />
      </div>
      <div className="space-y-2">
        <h3 className="text-white text-lg font-semibold">No Himawari-9 data yet</h3>
        <p className="text-white/60 text-sm max-w-xs">
          Fetch data to get started &mdash; images update automatically once available
        </p>
      </div>

      <div className="text-xs text-white/50" data-testid="s3-availability">
        {s3Latest?.scan_time
          ? `Latest on S3: ${timeAgo(s3Latest.scan_time)}`
          : 'No recent data found on S3'}
      </div>

      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={fetchNow}
          disabled={!!activeJobId}
          className="px-4 py-2 rounded-lg bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {activeJobId ? 'Fetching\u2026' : 'Fetch Now'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/goes?tab=fetch')}
          className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
          data-testid="himawari-go-to-fetch"
        >
          Go to Fetch
        </button>
        <button
          type="button"
          onClick={handleScheduleAutoFetch}
          disabled={scheduleStatus === 'loading' || scheduleStatus === 'success'}
          className="px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
          data-testid="himawari-schedule-auto-fetch"
        >
          {scheduleStatus === 'loading' && 'Scheduling\u2026'}
          {scheduleStatus === 'success' && 'Auto-fetch scheduled! \u2713'}
          {scheduleStatus === 'idle' && 'Schedule Auto-fetch'}
          {scheduleStatus === 'error' && 'Retry Schedule'}
        </button>
      </div>

      {scheduleStatus === 'error' && scheduleError && (
        <p className="text-red-400 text-xs" data-testid="schedule-error">
          {scheduleError}
        </p>
      )}
    </div>
  );
}
