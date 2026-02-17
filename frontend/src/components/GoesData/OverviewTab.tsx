import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Download,
  Zap,
  Palette,
  GalleryHorizontalEnd,
  Satellite,
  HardDrive,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
} from 'lucide-react';
import api from '../../api/client';
import { formatBytes } from './utils';
import type { FrameStats } from './types';

interface CatalogLatest {
  scan_time: string;
  size: number;
  key: string;
  satellite: string;
  sector: string;
  band: string;
}

interface Job {
  id: string;
  name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface JobsResponse {
  items: Job[];
  total: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: 'bg-green-500/10 text-green-400 border-green-500/20', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <XCircle className="w-3 h-3" /> },
    running: { color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    pending: { color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock className="w-3 h-3" /> },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.color}`}>
      {m.icon}
      {status}
    </span>
  );
}

export default function OverviewTab() {
  const { data: catalogLatest } = useQuery<CatalogLatest>({
    queryKey: ['goes-catalog-latest'],
    queryFn: () => api.get('/goes/catalog/latest').then((r) => r.data),
    staleTime: 120_000,
    retry: 1,
  });

  const { data: stats } = useQuery<FrameStats>({
    queryKey: ['goes-frame-stats'],
    queryFn: () => api.get('/goes/frames/stats').then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: jobs } = useQuery<JobsResponse>({
    queryKey: ['goes-recent-jobs'],
    queryFn: () => api.get('/jobs', { params: { limit: 5 } }).then((r) => r.data),
    staleTime: 30_000,
  });

  const switchTab = (tabId: string) => {
    globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: tabId }));
  };

  const quickActions = [
    {
      label: 'Fetch Last Hour CONUS',
      description: 'Pre-fill fetch wizard for CONUS imagery',
      icon: <Download className="w-5 h-5" />,
      color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30',
      onClick: () => switchTab('fetch'),
    },
    {
      label: 'Fetch Latest FullDisk',
      description: 'One-click full hemisphere download',
      icon: <Zap className="w-5 h-5" />,
      color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
      onClick: () => switchTab('fetch'),
    },
    {
      label: 'True Color Now',
      description: 'Fetch & composite true color image',
      icon: <Palette className="w-5 h-5" />,
      color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
      onClick: () => switchTab('fetch'),
    },
    {
      label: 'View Gallery',
      description: 'Browse your downloaded frames',
      icon: <GalleryHorizontalEnd className="w-5 h-5" />,
      color: 'from-violet-500/20 to-purple-500/20 border-violet-500/30',
      onClick: () => switchTab('gallery'),
    },
  ];

  const satValues = stats ? Object.values(stats.by_satellite ?? {}) : [];
  const bandValues = stats ? Object.values(stats.by_band ?? {}) : [];
  const maxSatSize = satValues.length > 0 ? Math.max(...satValues.map((s) => s.size), 1) : 1;
  const maxBandCount = bandValues.length > 0 ? Math.max(...bandValues.map((b) => b.count), 1) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LayoutDashboard className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Overview</h2>
      </div>

      {/* Latest from AWS */}
      {catalogLatest && (
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Satellite className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Latest Available on AWS</h3>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-4 flex-1 min-w-[200px]">
              <div className="text-sm text-gray-500 dark:text-slate-400">{catalogLatest.satellite}</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {catalogLatest.sector} · {catalogLatest.band}
              </div>
              <div className="text-sm text-primary mt-1">
                {timeAgo(catalogLatest.scan_time)}
              </div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                {new Date(catalogLatest.scan_time).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Storage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-primary" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Total Frames</span>
          </div>
          <div className="text-3xl font-bold text-primary">
            {stats?.total_frames?.toLocaleString() ?? '—'}
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="flex items-center gap-2 mb-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Disk Usage</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">
            {stats ? formatBytes(stats.total_size_bytes) : '—'}
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 border border-gray-200 dark:border-slate-800 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Satellite className="w-4 h-4 text-amber-400" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Satellites</span>
          </div>
          <div className="text-3xl font-bold text-amber-400">
            {stats ? Object.keys(stats.by_satellite ?? {}).length : '—'}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`flex items-start gap-3 p-4 rounded-xl border bg-gradient-to-br ${action.color} hover:scale-[1.02] transition-all text-left`}
            >
              <div className="mt-0.5 text-gray-900 dark:text-white">{action.icon}</div>
              <div>
                <div className="font-medium text-sm text-gray-900 dark:text-white">{action.label}</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{action.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      {jobs && jobs.items.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h3>
          </div>
          <div className="space-y-3">
            {jobs.items.map((job) => (
              <div key={job.id} className="flex items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{job.name || 'Fetch Job'}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">{timeAgo(job.created_at)}</div>
                </div>
                {statusBadge(job.status)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Section (moved from StatsTab) */}
      {stats && (Object.keys(stats.by_satellite ?? {}).length > 0 || Object.keys(stats.by_band ?? {}).length > 0) && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-gray-900 dark:text-white">Statistics</h3>
          </div>

          {/* Storage by Satellite */}
          {Object.keys(stats.by_satellite ?? {}).length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-slate-300">Storage by Satellite</h4>
              <div className="space-y-3">
                {Object.entries(stats.by_satellite).map(([sat, data]) => (
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
          )}

          {/* Frames by Band */}
          {Object.keys(stats.by_band ?? {}).length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-slate-300">Frames by Band</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(stats.by_band).map(([bandKey, data]) => (
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
          )}
        </div>
      )}
    </div>
  );
}
