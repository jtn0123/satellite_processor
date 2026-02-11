import { useNavigate } from 'react-router-dom';
import { useStats, useHealthDetailed } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import {
  Upload,
  FlaskConical,
  Image,
  ListTodo,
  Activity,
  HardDrive,
  Database,
  Server,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import JobList from '../components/Jobs/JobList';
import { formatBytes } from '../utils/format';

const statusIcon: Record<string, { icon: React.ElementType; color: string }> = {
  ok: { icon: CheckCircle2, color: 'text-green-400' },
  healthy: { icon: CheckCircle2, color: 'text-green-400' },
  error: { icon: XCircle, color: 'text-red-400' },
  unhealthy: { icon: XCircle, color: 'text-red-400' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400' },
  degraded: { icon: AlertTriangle, color: 'text-yellow-400' },
};

export default function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { data: stats } = useStats();
  const { data: health } = useHealthDetailed();

  const statCards = [
    { label: 'Total Images', value: stats?.total_images ?? 0, icon: Image, color: 'text-cyan-400' },
    { label: 'Total Jobs', value: stats?.total_jobs ?? 0, icon: ListTodo, color: 'text-violet-400' },
    { label: 'Active Jobs', value: stats?.active_jobs ?? 0, icon: Activity, color: 'text-amber-400' },
  ];

  const storageUsed = stats?.storage?.used ?? 0;
  const storageTotal = stats?.storage?.total ?? 1;
  const storagePercent = Math.round((storageUsed / storageTotal) * 100);

  const checks = health?.checks ?? {};

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Satellite image processing overview</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <div
            key={s.label}
            className="bg-card border border-subtle rounded-xl p-4 hover:bg-card-hover transition-colors"
          >
            <div className="flex items-center justify-between">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}

        {/* Storage card */}
        <div className="bg-card border border-subtle rounded-xl p-4 hover:bg-card-hover transition-colors">
          <div className="flex items-center justify-between">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <span className="text-xs text-slate-500">{storagePercent}%</span>
          </div>
          <div className="mt-3 h-2 bg-space-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storagePercent > 90 ? 'bg-red-400' : storagePercent > 70 ? 'bg-yellow-400' : 'bg-emerald-400'
              }`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {formatBytes(storageUsed)} / {formatBytes(storageTotal)}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/upload')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-medium transition-colors focus-ring"
        >
          <Upload className="w-4 h-4" /> Upload Images
        </button>
        <button
          onClick={() => navigate('/process')}
          className="flex items-center gap-2 px-5 py-2.5 bg-space-700 hover:bg-space-600 border border-subtle rounded-xl text-sm font-medium transition-colors focus-ring"
        >
          <FlaskConical className="w-4 h-4" /> New Job
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Recent Jobs</h2>
          <JobList onSelect={(id) => navigate(`/jobs?id=${id}`)} limit={5} />
        </div>

        {/* System Health */}
        <div>
          <h2 className="text-lg font-semibold mb-3">System Health</h2>
          <div className="bg-card border border-subtle rounded-xl p-4 space-y-3">
            {/* Overall status */}
            {health && (
              <div className="flex items-center gap-2 pb-3 border-b border-subtle">
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
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <item.icon className="w-4 h-4 text-slate-400" />
                    {item.label}
                  </div>
                  <div className="flex items-center gap-2">
                    {check.latency_ms != null && (
                      <span className="text-xs text-slate-500">{check.latency_ms}ms</span>
                    )}
                    {check.free_gb != null && (
                      <span className="text-xs text-slate-500">{check.free_gb}GB free</span>
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
