import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, AlertTriangle, Play, PlayCircle, Loader2, CheckCircle2, Clock } from 'lucide-react';
import api from '../../api/client';
import type { CoverageStats, Gap } from './types';

interface BackfillPayload {
  satellite?: string;
  band?: string;
  sector: string;
  expected_interval: number;
}

export default function GapsTab() {
  const queryClient = useQueryClient();
  const [satellite, setSatellite] = useState('GOES-19');
  const [band, setBand] = useState('C02');
  const [expectedInterval, setExpectedInterval] = useState(10);
  const [confirmGap, setConfirmGap] = useState<Gap | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const { data: products } = useQuery<{ satellites: string[]; bands: { id: string; description: string }[] }>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: coverage, isLoading, refetch, isError } = useQuery<CoverageStats>({
    queryKey: ['goes-gaps', satellite, band, expectedInterval],
    queryFn: () =>
      api.get('/goes/gaps', { params: { satellite, band, expected_interval: expectedInterval } }).then((r) => r.data),
    enabled: false,
  });

  const backfillMutation = useMutation({
    mutationFn: (payload: BackfillPayload) => api.post('/goes/backfill', payload).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-gaps'] });
      setConfirmGap(null);
      setConfirmAll(false);
    },
  });

  const handleBackfillOne = (gap: Gap) => {
    setConfirmGap(gap);
    setConfirmAll(false);
  };

  const handleBackfillAll = () => {
    setConfirmAll(true);
    setConfirmGap(null);
  };

  const executeBackfill = () => {
    backfillMutation.mutate({
      satellite,
      band,
      sector: 'FullDisk',
      expected_interval: expectedInterval,
    });
  };

  const totalExpectedFrames = coverage?.gaps.reduce((sum, g) => sum + g.expected_frames, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Gap Detection</h2>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div>
          <label htmlFor="gap-satellite" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Satellite</label>
          <select id="gap-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            {(products?.satellites ?? ['GOES-16', 'GOES-18', 'GOES-19']).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gap-band" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Band</label>
          <select id="gap-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            {(products?.bands ?? [{ id: 'C02', description: 'Red' }, { id: 'C13', description: 'IR' }]).map((b) => (
              <option key={b.id} value={b.id}>{b.id} — {b.description}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gap-interval" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Expected Interval (min)</label>
          <input id="gap-interval" type="number" min={1} max={60} value={expectedInterval}
            onChange={(e) => setExpectedInterval(Number(e.target.value))}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
        </div>
        <div className="flex items-end">
          <button onClick={() => refetch()} disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-gray-900 dark:text-white rounded-lg text-sm font-medium hover:bg-primary/80 transition-colors disabled:opacity-50">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Detect Gaps
          </button>
        </div>
      </div>

      {/* Error */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-3 text-sm text-red-400">
          Failed to detect gaps. Check API connectivity.
        </div>
      )}

      {/* Backfill mutation status */}
      {backfillMutation.isPending && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-6 py-3 flex items-center gap-3 text-sm text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Backfill job submitted, processing...
        </div>
      )}
      {backfillMutation.isSuccess && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-6 py-3 flex items-center gap-3 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          Backfill job created! Check the Overview tab for job status.
        </div>
      )}
      {backfillMutation.isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-6 py-3 text-sm text-red-400">
          Backfill failed: {(backfillMutation.error as Error)?.message || 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {coverage && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800">
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Coverage</div>
              <div className={`text-3xl font-bold ${(() => {
                if (coverage.coverage_percent >= 95) return 'text-emerald-400';
                if (coverage.coverage_percent >= 80) return 'text-amber-400';
                return 'text-red-400';
              })()}`}>
                {coverage.coverage_percent.toFixed(1)}%
              </div>
            </div>
            <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800">
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Gaps Found</div>
              <div className="text-3xl font-bold text-amber-400">{coverage.gap_count}</div>
            </div>
            <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800">
              <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">Total Frames</div>
              <div className="text-3xl font-bold text-primary">{coverage.total_frames}</div>
            </div>
          </div>

          {/* Confirmation dialog */}
          {(confirmGap || confirmAll) && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 space-y-3">
              <div className="text-sm font-medium text-amber-300">
                {confirmAll
                  ? `Backfill all ${coverage.gap_count} gaps (~${totalExpectedFrames} frames)?`
                  : `Backfill gap: ${new Date(confirmGap!.start).toLocaleString()} → ${new Date(confirmGap!.end).toLocaleString()} (~${confirmGap!.expected_frames} frames)?`}
              </div>
              <div className="flex gap-3">
                <button onClick={executeBackfill} disabled={backfillMutation.isPending}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 disabled:opacity-50">
                  {backfillMutation.isPending ? 'Submitting...' : 'Confirm Backfill'}
                </button>
                <button onClick={() => { setConfirmGap(null); setConfirmAll(false); }}
                  className="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-slate-600">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Gap list */}
          {coverage.gaps.length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 dark:border-slate-800">
                <h3 className="font-semibold text-gray-900 dark:text-white">Detected Gaps</h3>
                <button onClick={handleBackfillAll} disabled={backfillMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-sm font-medium hover:bg-amber-500/30 disabled:opacity-50">
                  <PlayCircle className="w-4 h-4" />
                  Backfill All ({coverage.gap_count})
                </button>
              </div>
              <div className="divide-y divide-gray-200 dark:divide-slate-800">
                {coverage.gaps.map((gap, i) => (
                  <div key={`${gap.start}-${i}`} className="flex items-center justify-between px-6 py-3">
                    <div className="flex items-center gap-4">
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <div className="text-sm text-gray-900 dark:text-white">
                          {new Date(gap.start).toLocaleString()} → {new Date(gap.end).toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {gap.duration_minutes.toFixed(0)} min · ~{gap.expected_frames} frames missing
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleBackfillOne(gap)} disabled={backfillMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-lg text-sm hover:bg-primary/20 disabled:opacity-50">
                      <Play className="w-3 h-3" />
                      Backfill
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coverage.gaps.length === 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-6 py-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <div className="text-sm text-emerald-400">No gaps detected — coverage looks good!</div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!coverage && !isLoading && !isError && (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <div className="text-sm">Select parameters and click &quot;Detect Gaps&quot; to scan for missing frames</div>
        </div>
      )}
    </div>
  );
}
