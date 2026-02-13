import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Download,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
} from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import type { Product, CoverageStats, SatelliteAvailability } from './types';

function formatAvailRange(avail: SatelliteAvailability): string {
  const from = new Date(avail.available_from);
  const fromStr = from.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).replace(',', '');
  if (!avail.available_to) return `${fromStr}–present`;
  const to = new Date(avail.available_to);
  const toStr = to.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).replace(',', '');
  return `${fromStr}–${toStr}`;
}

function isDateInRange(dateStr: string, avail: SatelliteAvailability): boolean {
  if (!dateStr) return true;
  const d = new Date(dateStr).getTime();
  const from = new Date(avail.available_from).getTime();
  if (d < from) return false;
  if (avail.available_to && d > new Date(avail.available_to).getTime()) return false;
  return true;
}

export default function FetchTab() {
  const [satellite, setSatellite] = useState('GOES-19');
  const [sector, setSector] = useState('FullDisk');
  const [band, setBand] = useState('C02');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data: products, isLoading: productsLoading, isError: productsError } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const currentAvail = products?.satellite_availability?.[satellite];

  const dateWarning = useMemo(() => {
    if (!currentAvail) return null;
    if (startTime && !isDateInRange(startTime, currentAvail)) {
      return `Start time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    }
    if (endTime && !isDateInRange(endTime, currentAvail)) {
      return `End time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    }
    return null;
  }, [startTime, endTime, currentAvail, satellite]);

  const {
    data: gaps,
    refetch: refetchGaps,
    isFetching: gapsFetching,
  } = useQuery<CoverageStats>({
    queryKey: ['goes-gaps', satellite, band],
    queryFn: () =>
      api.get('/goes/gaps', { params: { satellite, band, expected_interval: 10 } }).then((r) => r.data),
    enabled: false,
  });

  const fetchMutation = useMutation({
    mutationFn: () =>
      api.post('/goes/fetch', {
        satellite, sector, band,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      }).then((r) => r.data),
    onSuccess: (data) => showToast('success', `Fetch job created: ${data.job_id}`),
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: Array<{ msg?: string }> | string } } })?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail[0]?.msg ?? 'Validation error' : typeof detail === 'string' ? detail : 'Failed to create fetch job';
      showToast('error', msg.replace(/^Value error, /i, ''));
    },
  });

  const backfillMutation = useMutation({
    mutationFn: () => api.post('/goes/backfill', { satellite, band, sector }).then((r) => r.data),
    onSuccess: (data) => showToast('success', `Backfill job created: ${data.job_id}`),
    onError: () => showToast('error', 'Failed to create backfill job'),
  });

  return (
    <div className="space-y-6">
      {productsLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`prod-skel-${i}`} className="h-10 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-lg" />
          ))}
        </div>
      )}
      {productsError && <div className="text-sm text-red-400">Failed to load satellite products</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div>
          <label htmlFor="goes-satellite" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Satellite</label>
          <select id="goes-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            {products?.satellites.map((s) => {
              const avail = products.satellite_availability?.[s];
              const range = avail ? formatAvailRange(avail) : '';
              const active = avail?.status === 'active';
              return <option key={s} value={s}>{s} ({range}){active ? ' ✓' : ''}</option>;
            })}
          </select>
          {currentAvail?.status === 'historical' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-amber-400">
              <Clock className="w-3 h-3" />
              Historical — no new data
            </div>
          )}
        </div>
        <div>
          <label htmlFor="goes-sector" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Sector</label>
          <select id="goes-sector" value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="goes-band" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Band</label>
          <select id="goes-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.description}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h2 className="text-lg font-semibold">Fetch Frames</h2>
        <p className="text-xs text-gray-400 dark:text-slate-500">Maximum time range: 24 hours</p>

        {/* Quick Fetch Buttons */}
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Last Hour', hours: 1 },
            { label: 'Last 6 Hours', hours: 6 },
            { label: 'Last 12 Hours', hours: 12 },
            { label: 'Last 24 Hours', hours: 24 },
          ].map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                const now = new Date();
                const start = new Date(now.getTime() - preset.hours * 60 * 60 * 1000);
                const fmt = (d: Date) => d.toISOString().slice(0, 16);
                setStartTime(fmt(start));
                setEndTime(fmt(now));
              }}
              className="px-4 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary border border-gray-200 dark:border-slate-700 hover:border-primary/30 transition-colors"
              aria-label={`Quick fetch: ${preset.label}`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {currentAvail && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>{satellite} data available: <span className="text-gray-900 dark:text-white font-medium">{formatAvailRange(currentAvail)}</span></span>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="goes-start" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Start Time</label>
            <input type="datetime-local" id="goes-start" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
          <div>
            <label htmlFor="goes-end" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">End Time</label>
            <input type="datetime-local" id="goes-end" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
          </div>
        </div>
        {dateWarning && (
          <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {dateWarning}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => fetchMutation.mutate()} disabled={!startTime || !endTime || fetchMutation.isPending || !!dateWarning}
            className="flex items-center gap-2 px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" />
            {fetchMutation.isPending ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
        {fetchMutation.isSuccess && (
          <div className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Job created: {fetchMutation.data.job_id}
          </div>
        )}
        {fetchMutation.isError && (
          <div className="text-sm text-red-400">
            Failed to create fetch job
            {fetchMutation.error instanceof Error && `: ${fetchMutation.error.message}`}
          </div>
        )}
      </div>

      {/* Gap Detection */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coverage & Gaps</h2>
          <button onClick={() => refetchGaps()} disabled={gapsFetching}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 transition-colors">
            <Search className="w-4 h-4" />
            {gapsFetching ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        {gaps && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { val: `${gaps.coverage_percent}%`, label: 'Coverage', color: 'text-primary' },
                { val: gaps.gap_count, label: 'Gaps', color: 'text-amber-400' },
                { val: gaps.total_frames, label: 'Total Frames', color: 'text-gray-900 dark:text-white' },
                { val: gaps.expected_frames, label: 'Expected', color: 'text-gray-500 dark:text-slate-400' },
              ].map((s) => (
                <div key={s.label} className="bg-gray-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
            {gaps.gaps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400">Gap Timeline</h3>
                <div className="h-8 bg-gray-100 dark:bg-slate-800 rounded-lg overflow-hidden flex relative">
                  {gaps.time_range && (() => {
                    const rangeStart = new Date(gaps.time_range.start).getTime();
                    const rangeEnd = new Date(gaps.time_range.end).getTime();
                    const totalMs = rangeEnd - rangeStart;
                    if (totalMs <= 0) return null;
                    return gaps.gaps.map((gap) => {
                      const gapStart = new Date(gap.start).getTime();
                      const gapEnd = new Date(gap.end).getTime();
                      const left = ((gapStart - rangeStart) / totalMs) * 100;
                      const width = ((gapEnd - gapStart) / totalMs) * 100;
                      return (
                        <div key={gap.start} className="absolute inset-y-0 bg-red-500/60"
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                          title={`${gap.duration_minutes}min gap (${gap.expected_frames} missing frames)`} />
                      );
                    });
                  })()}
                  {gaps.coverage_percent > 0 && <div className="absolute inset-0 bg-emerald-500/20" />}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {gaps.gaps.map((gap) => (
                    <div key={gap.start} className="flex items-center gap-3 text-sm bg-gray-100/50 dark:bg-slate-800/50 rounded px-3 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-gray-600 dark:text-slate-300">
                        {new Date(gap.start).toLocaleString()} → {new Date(gap.end).toLocaleString()}
                      </span>
                      <span className="text-gray-400 dark:text-slate-500 ml-auto">{gap.duration_minutes}min · {gap.expected_frames} frames</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-gray-900 dark:text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                  <Download className="w-4 h-4" />
                  {backfillMutation.isPending ? 'Filling...' : 'Fill Gaps'}
                </button>
                {backfillMutation.isSuccess && (
                  <div className="text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Backfill job created: {backfillMutation.data.job_id}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
