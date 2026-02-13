import { useQuery } from '@tanstack/react-query';
import api from '../../api/client';
import { formatBytes } from './utils';
import type { FrameStats } from './types';

export default function StatsTab() {
  const { data: stats, isLoading } = useQuery<FrameStats>({
    queryKey: ['goes-frame-stats'],
    queryFn: () => api.get('/goes/frames/stats').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="text-sm text-slate-400">Loading stats...</div>;
  }

  if (!stats) return null;

  const maxSatSize = Math.max(...Object.values(stats.by_satellite).map((s) => s.size), 1);
  const maxBandCount = Math.max(...Object.values(stats.by_band).map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-primary">{stats.total_frames.toLocaleString()}</div>
          <div className="text-sm text-slate-400 mt-1">Total Frames</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-emerald-400">{formatBytes(stats.total_size_bytes)}</div>
          <div className="text-sm text-slate-400 mt-1">Total Storage</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-amber-400">{Object.keys(stats.by_satellite).length}</div>
          <div className="text-sm text-slate-400 mt-1">Satellites</div>
        </div>
      </div>

      {/* Storage by Satellite */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Storage by Satellite</h3>
        <div className="space-y-3">
          {Object.entries(stats.by_satellite).map(([sat, data]) => (
            <div key={sat} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-white">{sat}</span>
                <span className="text-slate-400">{data.count} frames · {formatBytes(data.size)}</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(data.size / maxSatSize) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Frames by Band */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Frames by Band</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats.by_band).map(([bandKey, data]) => (
            <div key={bandKey} className="bg-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-white">{bandKey}</div>
              <div className="text-xl font-bold text-primary">{data.count}</div>
              <div className="text-xs text-slate-500">{formatBytes(data.size)}</div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
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
