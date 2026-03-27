import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStats, useHealthDetailed } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Activity,
  HardDrive,
  Database,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  Download,
  Satellite,
  Clock,
  Calendar,
  Radio,
  Loader2,
} from 'lucide-react';
import JobList from '../components/Jobs/JobList';
import QueryErrorBox from '../components/QueryErrorBox';
import StatCard from '../components/ui/StatCard';
import ArcGauge from '../components/ui/ArcGauge';
import { formatBytes } from '../utils/format';
import { showToast } from '../utils/toast';
import api from '../api/client';

function storageArcColor(percent: number): string {
  if (percent > 90) return '#ef4444';
  if (percent > 70) return '#fbbf24';
  return '#22c55e';
}

const statusIcon: Record<string, { icon: React.ElementType; color: string }> = {
  ok: { icon: CheckCircle2, color: 'text-green-400' },
  healthy: { icon: CheckCircle2, color: 'text-green-400' },
  error: { icon: XCircle, color: 'text-red-400' },
  unhealthy: { icon: XCircle, color: 'text-red-400' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400' },
  degraded: { icon: AlertTriangle, color: 'text-yellow-400' },
};

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-400',
  running: 'bg-amber-400 animate-soft-pulse',
  failed: 'bg-red-400',
};

interface DashboardGoesStats {
  total_frames: number;
  frames_by_satellite: Record<string, number>;
  last_fetch_time: string | null;
  active_schedules: number;
  recent_jobs: { id: string; status: string; created_at: string; status_message: string }[];
  storage_by_satellite: Record<string, number>;
  storage_by_band: Record<string, number>;
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useStats();
  const { data: health } = useHealthDetailed();

  const {
    data: goesStats,
    isLoading: goesLoading,
    isError: goesError,
    refetch: refetchGoes,
  } = useQuery<DashboardGoesStats>({
    queryKey: ['goes-dashboard-stats'],
    queryFn: () => api.get('/satellite/dashboard-stats').then((r) => r.data),
    staleTime: 30_000,
    retry: 1,
  });

  const storageUsed = stats?.storage?.used ?? 0;
  const storageTotal = stats?.storage?.total ?? 1;
  const storagePercent = storageTotal > 0 ? Math.round((storageUsed / storageTotal) * 100) : 0;

  const checks = health?.checks ?? {};

  const totalGoesFrames = goesStats?.total_frames ?? 0;

  const [fetchingLatest, setFetchingLatest] = useState(false);
  const handleFetchLatest = async () => {
    setFetchingLatest(true);
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const res = await api.post('/satellite/fetch', {
        satellite: 'GOES-19',
        sector: 'CONUS',
        band: 'C02',
        start_time: oneHourAgo.toISOString(),
        end_time: now.toISOString(),
      });
      showToast('success', `Fetching latest CONUS imagery... (Job ${res.data.job_id})`);
    } catch {
      showToast('error', 'Failed to fetch latest imagery');
    } finally {
      setFetchingLatest(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Satellite image processing overview
        </p>
      </div>

      {/* Stats error fallback */}
      {statsError && (
        <QueryErrorBox
          message="Could not load system stats"
          icon={Server}
          onRetry={() => refetchStats()}
        />
      )}

      {/* Stats cards — hero + standard + storage */}
      {statsLoading && !statsError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['a', 'b', 'c', 'd'].map((k) => (
            <div
              key={k}
              className={`card p-4 h-24 skeleton-shimmer ${k === 'a' ? 'md:col-span-2' : ''}`}
            />
          ))}
        </div>
      )}
      <div
        className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${statsLoading && !statsError ? 'hidden' : 'stagger-reveal'}`}
      >
        {/* Hero stat — GOES Frames */}
        <StatCard
          label="GOES Frames"
          value={totalGoesFrames}
          icon={Satellite}
          color="text-primary"
          hero
        />

        {/* Standard stats */}
        <StatCard
          label="Total Jobs"
          value={stats?.total_jobs ?? 0}
          icon={Activity}
          color="text-violet-400"
        />
        <StatCard
          label="Active Jobs"
          value={stats?.active_jobs ?? 0}
          icon={Activity}
          color="text-amber-400"
        />

        {/* Storage card — arc gauge */}
        <div className="card card-hover p-4">
          <div className="flex items-center justify-between">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <ArcGauge
              percent={storagePercent}
              color={storageArcColor(storagePercent)}
              size={40}
              strokeWidth={3}
            />
          </div>
          <p className="stat-value text-2xl font-bold mt-1 text-gray-900 dark:text-white">
            {storagePercent}%
          </p>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
            {formatBytes(storageUsed)} / {formatBytes(storageTotal)}
          </p>
        </div>
      </div>

      {/* System Health — horizontal status strip */}
      {health && (
        <output
          className="card p-3 flex items-center gap-4 flex-wrap"
          aria-label="System health status"
        >
          <div className="flex items-center gap-2">
            {(() => {
              const cfg = statusIcon[health.status] ?? statusIcon.ok;
              const Icon = cfg.icon;
              return (
                <>
                  <Icon className={`w-4 h-4 ${cfg.color}`} aria-hidden="true" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                    System
                  </span>
                  <span className="sr-only">{health.status}</span>
                </>
              );
            })()}
          </div>
          <div className="w-px h-4 bg-gray-200 dark:bg-space-700" />
          {[
            { key: 'database', label: 'Database', icon: Database },
            { key: 'redis', label: 'Redis', icon: Server },
            { key: 'disk', label: 'Disk', icon: HardDrive },
          ].map((item) => {
            const check = checks[item.key];
            if (!check) return null;
            const cfg = statusIcon[check.status] ?? statusIcon.ok;
            const StatusIcon = cfg.icon;
            return (
              <div
                key={item.key}
                className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300"
              >
                <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} aria-hidden="true" />
                <span>{item.label}</span>
                <span className="sr-only">{check.status}</span>
                {check.latency_ms != null && (
                  <span className="text-gray-400 dark:text-slate-500 font-mono text-[10px]">
                    {check.latency_ms}ms
                  </span>
                )}
                {check.free_gb != null && (
                  <span className="text-gray-400 dark:text-slate-500 font-mono text-[10px]">
                    {check.free_gb}GB
                  </span>
                )}
              </div>
            );
          })}
        </output>
      )}

      {/* GOES stats error fallback */}
      {goesError && (
        <QueryErrorBox
          message="Could not load satellite data"
          icon={Satellite}
          onRetry={() => refetchGoes()}
        />
      )}

      {/* GOES stats loading skeleton */}
      {goesLoading && !goesError && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded skeleton-shimmer" />
            <div className="h-5 w-32 rounded skeleton-shimmer" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="card-inner p-3 h-16 skeleton-shimmer" />
            ))}
          </div>
        </div>
      )}

      {/* GOES stats empty state (API returned but no data) */}
      {!goesLoading &&
        goesStats &&
        totalGoesFrames === 0 &&
        !statsLoading &&
        stats?.total_images !== 0 && (
          <div className="card p-6 text-center">
            <Satellite className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-slate-400">No satellite data yet</p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">
              Fetch GOES data to see stats here
            </p>
            <button
              type="button"
              onClick={handleFetchLatest}
              disabled={fetchingLatest}
              data-testid="dashboard-fetch-latest"
              className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-medium hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 transition-all btn-interactive"
            >
              {fetchingLatest ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Satellite className="w-5 h-5" />
              )}
              {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
            </button>
          </div>
        )}

      {/* Satellite Data Section */}
      {goesStats && totalGoesFrames > 0 && (
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" aria-hidden="true" />
            <Satellite className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Satellite Data</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-reveal">
            <div className="card-inner p-3">
              <p className="stat-value text-2xl font-bold text-primary">
                {totalGoesFrames.toLocaleString()}
              </p>
              <p className="text-sm text-gray-600 dark:text-slate-400">Total Frames</p>
            </div>
            {goesStats.frames_by_satellite &&
              Object.entries(goesStats.frames_by_satellite).map(([sat, count]) => (
                <div key={sat} className="card-inner p-3">
                  <p className="stat-value text-2xl font-bold text-gray-900 dark:text-white">
                    {count.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-slate-400">{sat}</p>
                </div>
              ))}
            <div className="card-inner p-3">
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {goesStats.last_fetch_time
                    ? new Date(goesStats.last_fetch_time).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">Last Fetch</p>
            </div>
            <div className="card-inner p-3">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-500 dark:text-slate-400" />
                <p className="stat-value text-2xl font-bold text-gray-900 dark:text-white">
                  {goesStats.active_schedules}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-400">Active Schedules</p>
            </div>
          </div>

          {/* Fetch Latest CTA */}
          <button
            type="button"
            onClick={handleFetchLatest}
            disabled={fetchingLatest}
            data-testid="dashboard-fetch-latest"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-medium hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 transition-all btn-interactive"
          >
            {fetchingLatest ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Satellite className="w-5 h-5" />
            )}
            {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
          </button>

          {/* Storage breakdown bar */}
          {goesStats.storage_by_satellite &&
            Object.keys(goesStats.storage_by_satellite).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">
                  Storage by Satellite
                </h3>
                {(() => {
                  const entries = Object.entries(goesStats.storage_by_satellite);
                  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
                  const colors = ['bg-primary', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400'];
                  const glows = [
                    'shadow-primary/20',
                    'shadow-violet-400/20',
                    'shadow-amber-400/20',
                    'shadow-emerald-400/20',
                  ];
                  return entries.map(([sat, size], i) => (
                    <div key={sat} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 dark:text-slate-400 w-20 truncate">
                        {sat}
                      </span>
                      <div className="flex-1 h-2.5 bg-gray-200 dark:bg-space-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors[i % colors.length]} shadow-sm ${glows[i % glows.length]} transition-all duration-500`}
                          style={{ width: `${(size / maxVal) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 dark:text-slate-500 w-16 text-right font-mono">
                        {formatBytes(size)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            )}

          {/* Recent Fetches */}
          {goesStats.recent_jobs && goesStats.recent_jobs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">
                Recent Fetches
              </h3>
              <div className="space-y-1">
                {goesStats.recent_jobs.slice(0, 5).map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between card-inner px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        data-testid="recent-job-dot"
                        className={`w-2 h-2 rounded-full ${statusColors[job.status] ?? 'bg-slate-400'}`}
                      />
                      <span className="text-gray-600 dark:text-slate-300 truncate max-w-[150px]">
                        {job.status_message || job.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500 font-mono">
                      <span>{new Date(job.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unified Onboarding — shown when no images */}
      {!statsLoading && stats?.total_images === 0 && (
        <div className="card p-6 border-primary/20">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Get Started</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 stagger-reveal">
            <Link
              to="/live"
              className="card-interactive p-4 flex items-start gap-3 border-t-2 border-t-primary"
            >
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">
                  1. Watch live imagery
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  See real-time GOES satellite feeds
                </p>
              </div>
            </Link>
            <Link
              to="/goes"
              className="card-interactive p-4 flex items-start gap-3 border-t-2 border-t-violet-400"
            >
              <div className="p-2 bg-violet-500/10 rounded-lg shrink-0">
                <Satellite className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">
                  2. Browse &amp; fetch frames
                </p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  Download and explore satellite imagery
                </p>
              </div>
            </Link>
            <Link
              to="/jobs"
              className="card-interactive p-4 flex items-start gap-3 border-t-2 border-t-emerald-400"
            >
              <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                <Download className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">3. Monitor jobs</p>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                  Track fetch and processing jobs
                </p>
              </div>
            </Link>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleFetchLatest}
              disabled={fetchingLatest}
              data-testid="dashboard-fetch-latest"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-medium hover:shadow-lg hover:shadow-primary/20 disabled:opacity-50 transition-all btn-interactive"
            >
              {fetchingLatest ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Satellite className="w-5 h-5" />
              )}
              {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/goes')}
              className="flex items-center gap-2 px-5 py-2.5 btn-primary-mix text-gray-900 dark:text-white rounded-xl text-sm font-medium transition-colors focus-ring"
              aria-label="Fetch satellite data now"
            >
              <Download className="w-4 h-4" /> Advanced Fetch
            </button>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => navigate('/goes')}
          className="flex items-center gap-2 px-5 py-2.5 min-h-11 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl text-sm font-medium transition-all focus-ring active:scale-[0.97] btn-interactive"
        >
          <Download className="w-4 h-4" /> Browse & Fetch
        </button>
        <button
          type="button"
          onClick={() => navigate('/animate')}
          className="flex items-center gap-2 px-5 py-2.5 min-h-11 card border border-gray-200 dark:border-space-700/50 rounded-xl text-sm font-medium transition-colors focus-ring active:scale-[0.97] hover:border-primary/30"
        >
          <Satellite className="w-4 h-4" /> Create Animation
        </button>
      </div>

      {/* Recent Jobs — full width */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-violet-400 rounded-full" aria-hidden="true" />
          <span>Recent Jobs</span>
        </h2>
        <JobList onSelect={(id) => navigate(`/jobs?id=${id}`)} limit={5} />
      </div>
    </div>
  );
}
