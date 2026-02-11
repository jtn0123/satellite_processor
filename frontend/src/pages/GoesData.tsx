import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Satellite, Download, Search, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';

interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
}

interface Gap {
  start: string;
  end: string;
  duration_minutes: number;
  expected_frames: number;
}

interface CoverageStats {
  coverage_percent: number;
  gap_count: number;
  total_frames: number;
  expected_frames: number;
  time_range: { start: string; end: string } | null;
  gaps: Gap[];
}

export default function GoesData() {
  usePageTitle('GOES Data');
  const [satellite, setSatellite] = useState('GOES-16');
  const [sector, setSector] = useState('FullDisk');
  const [band, setBand] = useState('C02');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data: products, isLoading: productsLoading, isError: productsError } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const {
    data: gaps,
    refetch: refetchGaps,
    isFetching: gapsFetching,
  } = useQuery<CoverageStats>({
    queryKey: ['goes-gaps', satellite, band],
    queryFn: () =>
      api
        .get('/goes/gaps', { params: { satellite, band, expected_interval: 10 } })
        .then((r) => r.data),
    enabled: false,
  });

  const fetchMutation = useMutation({
    mutationFn: () =>
      api
        .post('/goes/fetch', {
          satellite,
          sector,
          band,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
        })
        .then((r) => r.data),
  });

  const backfillMutation = useMutation({
    mutationFn: () =>
      api
        .post('/goes/backfill', { satellite, band, sector })
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Satellite className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold">GOES Data</h1>
      </div>

      {/* Selectors */}
      {productsLoading && <div className="text-sm text-slate-400">Loading products...</div>}
      {productsError && <div className="text-sm text-red-400">Failed to load satellite products</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 rounded-xl p-6 border border-slate-800">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Satellite</label>
          <select
            value={satellite}
            onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
          >
            {products?.satellites.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Sector</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
          >
            {products?.sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1">Band</label>
          <select
            value={band}
            onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
          >
            {products?.bands.map((b) => (
              <option key={b.id} value={b.id}>{b.id} — {b.description}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fetch controls */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h2 className="text-lg font-semibold">Fetch Frames</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Start Time</label>
            <input
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">End Time</label>
            <input
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => fetchMutation.mutate()}
            disabled={!startTime || !endTime || fetchMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
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
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coverage & Gaps</h2>
          <button
            onClick={() => refetchGaps()}
            disabled={gapsFetching}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            {gapsFetching ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>

        {gaps && (
          <>
            {/* Coverage stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-primary">{gaps.coverage_percent}%</div>
                <div className="text-sm text-slate-400">Coverage</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-amber-400">{gaps.gap_count}</div>
                <div className="text-sm text-slate-400">Gaps</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{gaps.total_frames}</div>
                <div className="text-sm text-slate-400">Total Frames</div>
              </div>
              <div className="bg-slate-800 rounded-lg p-4">
                <div className="text-2xl font-bold text-slate-400">{gaps.expected_frames}</div>
                <div className="text-sm text-slate-400">Expected</div>
              </div>
            </div>

            {/* Gap timeline */}
            {gaps.gaps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-400">Gap Timeline</h3>
                <div className="h-8 bg-slate-800 rounded-lg overflow-hidden flex relative">
                  {gaps.time_range && (() => {
                    const rangeStart = new Date(gaps.time_range.start).getTime();
                    const rangeEnd = new Date(gaps.time_range.end).getTime();
                    const totalMs = rangeEnd - rangeStart;
                    if (totalMs <= 0) return null;
                    return gaps.gaps.map((gap, i) => {
                      const gapStart = new Date(gap.start).getTime();
                      const gapEnd = new Date(gap.end).getTime();
                      const left = ((gapStart - rangeStart) / totalMs) * 100;
                      const width = ((gapEnd - gapStart) / totalMs) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute inset-y-0 bg-red-500/60"
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                          title={`${gap.duration_minutes}min gap (${gap.expected_frames} missing frames)`}
                        />
                      );
                    });
                  })()}
                  {gaps.coverage_percent > 0 && (
                    <div className="absolute inset-0 bg-emerald-500/20" />
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1">
                  {gaps.gaps.map((gap, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm bg-slate-800/50 rounded px-3 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-slate-300">
                        {new Date(gap.start).toLocaleString()} → {new Date(gap.end).toLocaleString()}
                      </span>
                      <span className="text-slate-500 ml-auto">
                        {gap.duration_minutes}min · {gap.expected_frames} frames
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors"
                >
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
