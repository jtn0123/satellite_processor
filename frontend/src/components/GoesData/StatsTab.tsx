import { useQuery } from '@tanstack/react-query';
import { Satellite } from 'lucide-react';
import api from '../../api/client';
import { formatBytes } from './utils';
import EmptyState from './EmptyState';
import type { FrameStats } from './types';

export default function StatsTab() {
  const { data: stats, isLoading, isError } = useQuery<FrameStats>({
    queryKey: ['goes-frame-stats'],
    queryFn: () => api.get('/goes/frames/stats').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="text-sm text-gray-500 dark:text-slate-400">Loading stats...</div>;
  }

  if (isError) return <div className="text-sm text-red-400">Failed to load statistics.</div>;
  if (!stats) return null;

  if (stats.total_frames === 0) {
    return (
      <EmptyState
        icon={<Satellite className="w-8 h-8" />}
        title="No statistics yet"
        description="Fetch some satellite data first — statistics will appear here once you have frames to analyze."
        action={{
          label: 'Go to Fetch Tab',
          onClick: () => globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' })),
        }}
      />
    );
  }

  const satValues = Object.values(stats.by_satellite ?? {});
  const bandValues = Object.values(stats.by_band ?? {});
  const maxSatSize = satValues.length > 0 ? Math.max(...satValues.map((s) => s.size), 1) : 1;
  const maxBandCount = bandValues.length > 0 ? Math.max(...bandValues.map((b) => b.count), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="text-3xl font-bold text-primary">{stats.total_frames.toLocaleString()}</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Total Frames</div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="text-3xl font-bold text-emerald-400">{formatBytes(stats.total_size_bytes)}</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Total Storage</div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="text-3xl font-bold text-amber-400">{Object.keys(stats.by_satellite ?? {}).length}</div>
          <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">Satellites</div>
        </div>
      </div>

      {/* Storage by Satellite */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Storage by Satellite</h3>
        <div className="space-y-3">
          {Object.entries(stats.by_satellite ?? {}).map(([sat, data]) => (
            <div key={sat} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-900 dark:text-white">{sat}</span>
                <span className="text-gray-500 dark:text-slate-400">{data.count} frames · {formatBytes(data.size)}</span>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(data.size / maxSatSize) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Frames by Band */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Frames by Band</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats.by_band ?? {}).map(([bandKey, data]) => (
            <div key={bandKey} className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-gray-900 dark:text-white">{bandKey}</div>
              <div className="text-xl font-bold text-primary">{data.count}</div>
              <div className="text-xs text-gray-400 dark:text-slate-500">{formatBytes(data.size)}</div>
              <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary/60 rounded-full"
                  style={{ width: `${(data.count / maxBandCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
