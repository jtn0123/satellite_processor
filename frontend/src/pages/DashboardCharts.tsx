import {
  Satellite,
  Clock,
  Calendar,
} from 'lucide-react';
import { formatBytes } from '../utils/format';

interface DashboardStats {
  total_frames: number;
  frames_by_satellite: Record<string, number>;
  last_fetch_time: string | null;
  active_schedules: number;
  recent_jobs: Array<{ id: string; status: string; created_at: string; status_message: string }>;
  storage_by_satellite: Record<string, number>;
  storage_by_band: Record<string, number>;
}

interface DashboardChartsProps {
  goesStats: DashboardStats | undefined;
  isLoading: boolean;
}

export default function DashboardCharts({ goesStats, isLoading }: Readonly<DashboardChartsProps>) {
  const totalGoesFrames = goesStats?.total_frames ?? 0;

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 space-y-4 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-gray-200 dark:bg-space-700 rounded" />
          <div className="h-5 w-32 bg-gray-200 dark:bg-space-700 rounded" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['a','b','c','d'].map((k) => (
            <div key={k} className="bg-gray-100 dark:bg-space-800 rounded-lg p-3 h-16" />
          ))}
        </div>
      </div>
    );
  }

  if (!goesStats || totalGoesFrames === 0) return null;

  return (
    <div className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Satellite className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Satellite Data</h2>
      </div>

      <div className="@container grid grid-cols-1 @xs:grid-cols-2 @md:grid-cols-4 gap-4">
        <div className="bg-gray-100 dark:bg-space-800 rounded-lg p-3">
          <p className="text-2xl font-bold text-primary">{totalGoesFrames.toLocaleString()}</p>
          <p className="text-xs text-gray-500 dark:text-slate-400">Total Frames</p>
        </div>
        {goesStats.frames_by_satellite && Object.entries(goesStats.frames_by_satellite).map(([sat, count]) => (
          <div key={sat} className="bg-gray-100 dark:bg-space-800 rounded-lg p-3">
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{count.toLocaleString()}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400">{sat}</p>
          </div>
        ))}
        <div className="bg-gray-100 dark:bg-space-800 rounded-lg p-3">
          <div className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {goesStats.last_fetch_time
                ? new Date(goesStats.last_fetch_time).toLocaleString()
                : 'Never'}
            </p>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Last Fetch</p>
        </div>
        <div className="bg-gray-100 dark:bg-space-800 rounded-lg p-3">
          <div className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{goesStats.active_schedules}</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400">Active Schedules</p>
        </div>
      </div>

      {/* Storage breakdown bar */}
      {goesStats.storage_by_satellite && Object.keys(goesStats.storage_by_satellite).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">Storage by Satellite</h3>
          {(() => {
            const entries = Object.entries(goesStats.storage_by_satellite);
            const maxVal = Math.max(...entries.map(([, v]) => v), 1);
            const colors = ['bg-cyan-400', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400'];
            return entries.map(([sat, size], i) => (
              <div key={sat} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-slate-400 w-20 truncate">{sat}</span>
                <div className="flex-1 h-3 bg-gray-200 dark:bg-space-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors[i % colors.length]}`}
                    style={{ width: `${(size / maxVal) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 dark:text-slate-500 w-16 text-right">{formatBytes(size)}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
