import {
  Image,
  ListTodo,
  Activity,
  HardDrive,
} from 'lucide-react';
import { formatBytes } from '../utils/format';

function storageBarColor(percent: number): string {
  if (percent > 90) return 'bg-red-400';
  if (percent > 70) return 'bg-yellow-400';
  return 'bg-emerald-400';
}

interface DashboardStatsProps {
  stats: {
    total_images: number;
    total_jobs: number;
    active_jobs: number;
    storage?: { used: number; total: number };
  } | undefined;
  isLoading: boolean;
}

export default function DashboardStats({ stats, isLoading }: Readonly<DashboardStatsProps>) {
  const statCards = [
    { label: 'Total Images', value: stats?.total_images ?? 0, icon: Image, color: 'text-cyan-400' },
    { label: 'Total Jobs', value: stats?.total_jobs ?? 0, icon: ListTodo, color: 'text-violet-400' },
    { label: 'Active Jobs', value: stats?.active_jobs ?? 0, icon: Activity, color: 'text-amber-400' },
  ];

  const storageUsed = stats?.storage?.used ?? 0;
  const storageTotal = stats?.storage?.total ?? 1;
  const storagePercent = Math.round((storageUsed / storageTotal) * 100);

  return (
    <>
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {["a","b","c","d"].map((k) => (
            <div key={k} className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-4 h-24 animate-pulse" />
          ))}
        </div>
      )}
      <div className={`@container grid grid-cols-1 @xs:grid-cols-2 @md:grid-cols-4 gap-4 ${isLoading ? 'hidden' : ''}`}>
        {statCards.map((s) => (
          <div
            key={s.label}
            className="glass-card border border-gray-200 dark:border-space-700/50 rounded-xl p-4 hover:bg-gray-50 dark:bg-space-800 transition-colors inset-shadow-sm dark:inset-shadow-white/5"
          >
            <div className="flex items-center justify-between">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2 text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}

        {/* Storage card */}
        <div className="glass-card border border-gray-200 dark:border-space-700/50 rounded-xl p-4 hover:bg-gray-50 dark:bg-space-800 transition-colors inset-shadow-sm dark:inset-shadow-white/5">
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
    </>
  );
}
