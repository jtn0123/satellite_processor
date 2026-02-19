import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStats, useHealthDetailed } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  ListTodo,
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
import { formatBytes } from '../utils/format';
import { showToast } from '../utils/toast';
import api from '../api/client';

function storageBarColor(percent: number): string {
  if (percent > 90) return 'bg-red-400';
  if (percent > 70) return 'bg-yellow-400';
  return 'bg-emerald-400';
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
  running: 'bg-amber-400 animate-pulse',
  failed: 'bg-red-400',
};

interface DashboardStats {
  total_frames: number;
  frames_by_satellite: Record<string, number>;
  last_fetch_time: string | null;
  active_schedules: number;
  recent_jobs: Array<{ id: string; status: string; created_at: string; status_message: string }>;
  storage_by_satellite: Record<string, number>;
  storage_by_band: Record<string, number>;
}

export default function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useStats();
  const { data: health } = useHealthDetailed();

  const { data: goesStats, isLoading: goesLoading, isError: goesError } = useQuery<DashboardStats>({
    queryKey: ['goes-dashboard-stats'],
    queryFn: () => api.get('/goes/dashboard-stats').then((r) => r.data),
    staleTime: 30_000,
    retry: 1,
  });

  const storageUsed = stats?.storage?.used ?? 0;
  const storageTotal = stats?.storage?.total ?? 1;
  const storagePercent = Math.round((storageUsed / storageTotal) * 100);

  const checks = health?.checks ?? {};

  const totalGoesFrames = goesStats?.total_frames ?? 0;
  const showOnboarding = !statsLoading && (stats?.total_images === 0) && totalGoesFrames === 0;

  const statCards = [
    { label: 'GOES Frames', value: totalGoesFrames, icon: Satellite, color: 'text-sky-400' },
    { label: 'Total Jobs', value: stats?.total_jobs ?? 0, icon: ListTodo, color: 'text-violet-400' },
    { label: 'Active Jobs', value: stats?.active_jobs ?? 0, icon: Activity, color: 'text-amber-400' },
  ];

  const [fetchingLatest, setFetchingLatest] = useState(false);
  const handleFetchLatest = async () => {
    setFetchingLatest(true);
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const res = await api.post('/goes/fetch', {
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
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Satellite image processing overview</p>
      </div>

      {/* Stats cards */}
      {statsLoading && !statsError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["a","b","c","d"].map((k) => (
            <div key={k} className="bg-gray-200/50 dark:bg-white/[0.06] border border-gray-200 dark:border-space-700/50 rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      )}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${statsLoading && !statsError ? 'hidden' : ''}`}>
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-white/75 dark:bg-space-800/70 backdrop-blur-sm border border-gray-200 dark:border-space-700/50 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-space-700 transition-colors inset-shadow-sm dark:inset-shadow-white/5"
          >
            <div className="flex items-center justify-between">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}

        {/* Storage card */}
        <div className="bg-white/75 dark:bg-space-800/70 backdrop-blur-sm border border-gray-200 dark:border-space-700/50 rounded-xl p-4 hover:bg-gray-50 dark:hover:bg-space-700 transition-colors inset-shadow-sm dark:inset-shadow-white/5">
          <div className="flex items-center justify-between">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-gray-400 dark:text-slate-500">{storagePercent}%</span>
          </div>
          <div className="mt-3 h-2.5 bg-gray-200 dark:bg-space-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${storageBarColor(storagePercent)}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
            {formatBytes(storageUsed)} / {formatBytes(storageTotal)}
          </p>
        </div>
      </div>

      {/* GOES stats error fallback */}
      {goesError && (
        <div className="bg-white dark:bg-space-800 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 text-center">
          <Satellite className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-slate-400">Could not load satellite data</p>
        </div>
      )}

      {/* GOES stats loading skeleton (#9) */}
      {goesLoading && !goesError && (
        <div className="bg-gray-200/50 dark:bg-white/[0.06] border border-gray-200 dark:border-space-700/50 rounded-xl p-6 space-y-4 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gray-200 dark:bg-white/10" />
            <div className="h-5 w-32 rounded bg-gray-200 dark:bg-white/10" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map((k) => (
              <div key={k} className="bg-gray-100 dark:bg-white/[0.06] rounded-lg p-3 h-16" />
            ))}
          </div>
        </div>
      )}

      {/* GOES stats empty state (API returned but no data) */}
      {!goesLoading && goesStats && totalGoesFrames === 0 && !showOnboarding && (
        <div className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 text-center">
          <Satellite className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-slate-400">No satellite data yet</p>
          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Fetch GOES data to see stats here</p>
          <button
            type="button"
            onClick={handleFetchLatest}
            disabled={fetchingLatest}
            data-testid="dashboard-fetch-latest"
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {fetchingLatest ? <Loader2 className="w-5 h-5 animate-spin" /> : <Satellite className="w-5 h-5" />}
            {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
          </button>
        </div>
      )}

      {/* #1: Satellite Data Section */}
      {goesStats && totalGoesFrames > 0 && (
        <div className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Satellite className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Satellite Data</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          {/* Fetch Latest CTA */}
          <button
            type="button"
            onClick={handleFetchLatest}
            disabled={fetchingLatest}
            data-testid="dashboard-fetch-latest"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {fetchingLatest ? <Loader2 className="w-5 h-5 animate-spin" /> : <Satellite className="w-5 h-5" />}
            {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
          </button>

          {/* Storage breakdown bar */}
          {goesStats.storage_by_satellite && Object.keys(goesStats.storage_by_satellite).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">Storage by Satellite</h3>
              {(() => {
                const entries = Object.entries(goesStats.storage_by_satellite);
                const maxVal = Math.max(...entries.map(([, v]) => v), 1);
                const colors = ['bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400'];
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

          {/* Recent Fetches */}
          {goesStats.recent_jobs && goesStats.recent_jobs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">Recent Fetches</h3>
              <div className="space-y-1">
                {goesStats.recent_jobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between bg-gray-100 dark:bg-space-800 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span data-testid="recent-job-dot" className={`w-2 h-2 rounded-full ${statusColors[job.status] ?? 'bg-slate-400'}`} />
                      <span className="text-gray-600 dark:text-slate-300 truncate max-w-[150px]">{job.status_message || job.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                      <span>{new Date(job.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* #4: Empty State Onboarding */}
      {showOnboarding && (
        <div className="bg-white dark:bg-space-800/70 border border-primary/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Get Started</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <span className="text-primary font-bold text-sm">1</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Go to GOES Data → Fetch tab</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Navigate to the satellite data section</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg">
              <div className="p-2 bg-violet-500/10 rounded-lg shrink-0">
                <span className="text-violet-400 font-bold text-sm">2</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Select satellite</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Default: GOES-19 (latest active)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg">
              <div className="p-2 bg-amber-500/10 rounded-lg shrink-0">
                <span className="text-amber-400 font-bold text-sm">3</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Use &quot;Last Hour&quot; quick fetch</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">One-click to get recent imagery</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg">
              <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                <span className="text-emerald-400 font-bold text-sm">4</span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">Browse your first frames</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">View, organize, and process imagery</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleFetchLatest}
              disabled={fetchingLatest}
              data-testid="dashboard-fetch-latest"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-xl font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {fetchingLatest ? <Loader2 className="w-5 h-5 animate-spin" /> : <Satellite className="w-5 h-5" />}
              {fetchingLatest ? 'Fetching...' : 'Fetch Latest CONUS'}
            </button>
            <button
              onClick={() => navigate('/goes')}
              className="flex items-center gap-2 px-5 py-2.5 btn-primary-mix text-gray-900 dark:text-white rounded-xl text-sm font-medium transition-colors focus-ring"
              aria-label="Fetch satellite data now"
            >
              <Download className="w-4 h-4" /> Advanced Fetch
            </button>
          </div>
        </div>
      )}

      {/* Getting Started - original (shown when no images but has GOES frames) */}
      {stats?.total_images === 0 && totalGoesFrames > 0 && (
        <div className="bg-white dark:bg-space-800/70 border border-primary/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Getting Started</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Link to="/live" className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg hover:bg-space-700 transition-colors">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">1. Watch live imagery</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">See real-time GOES satellite feeds</p>
              </div>
            </Link>
            <Link to="/goes" className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg hover:bg-space-700 transition-colors">
              <div className="p-2 bg-violet-500/10 rounded-lg shrink-0">
                <Satellite className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">2. Browse & fetch frames</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Download and explore satellite imagery</p>
              </div>
            </Link>
            <Link to="/jobs" className="flex items-start gap-3 p-4 bg-gray-100 dark:bg-space-800 rounded-lg hover:bg-space-700 transition-colors">
              <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                <Download className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 dark:text-white">3. Monitor jobs</p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Track fetch and processing jobs</p>
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* View Live quick-link */}
      <Link
        to="/live"
        className="flex items-center gap-4 p-5 bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl hover:bg-gray-50 dark:hover:bg-space-700 transition-colors group"
      >
        <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/20 transition-colors">
          <Radio className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">View Live</p>
          <p className="text-sm text-gray-500 dark:text-slate-400">Watch real-time satellite imagery</p>
        </div>
      </Link>

      {/* Quick actions */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <button
          onClick={() => navigate('/goes')}
          className="flex items-center gap-2 px-5 py-2.5 min-h-11 btn-primary-mix text-gray-900 dark:text-white rounded-xl text-sm font-medium transition-colors focus-ring active:scale-[0.97]"
        >
          <Download className="w-4 h-4" /> Browse & Fetch
        </button>
        <button
          onClick={() => navigate('/animate')}
          className="flex items-center gap-2 px-5 py-2.5 min-h-11 bg-space-700 hover:bg-space-600 border border-gray-200 dark:border-space-700/50 rounded-xl text-sm font-medium transition-colors focus-ring active:scale-[0.97]"
        >
          <Satellite className="w-4 h-4" /> Create Animation
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Recent jobs - #5: with progress bars */}
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Recent Jobs</h2>
          <JobList onSelect={(id) => navigate(`/jobs?id=${id}`)} limit={5} />
        </div>

        {/* System Health */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />System Health</h2>
          <div className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-4 space-y-3 inset-shadow-sm dark:inset-shadow-white/5">
            {/* Overall status */}
            {health && (
              <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-space-700/50">
                {(() => {
                  const cfg = statusIcon[health.status] ?? statusIcon.ok;
                  const Icon = cfg.icon;
                  return (
                    <>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                      <span className="text-sm font-medium capitalize">{health.status}</span>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Individual checks */}
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
                <div key={item.key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                    <item.icon className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                    {item.label}
                  </div>
                  <div className="flex items-center gap-2">
                    {check.latency_ms != null && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">{check.latency_ms}ms</span>
                    )}
                    {check.free_gb != null && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">{check.free_gb}GB free</span>
                    )}
                    <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
