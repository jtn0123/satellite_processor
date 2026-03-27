import { Image, Activity, HardDrive } from 'lucide-react';
import { formatBytes } from '../utils/format';
import StatCard from '../components/ui/StatCard';
import ArcGauge from '../components/ui/ArcGauge';

function storageArcColor(percent: number): string {
  if (percent > 90) return '#ef4444';
  if (percent > 70) return '#fbbf24';
  return '#22c55e';
}

interface DashboardStatsProps {
  stats:
    | {
        total_images: number;
        total_jobs: number;
        active_jobs: number;
        storage?: { used: number; total: number };
      }
    | undefined;
  isLoading: boolean;
}

export default function DashboardStats({ stats, isLoading }: Readonly<DashboardStatsProps>) {
  const storageUsed = stats?.storage?.used ?? 0;
  const storageTotal = stats?.storage?.total ?? 1;
  const storagePercent = Math.round((storageUsed / storageTotal) * 100);

  return (
    <>
      {isLoading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {['a', 'b', 'c', 'd'].map((k) => (
            <div key={k} className="card p-4 h-24 skeleton-shimmer" />
          ))}
        </div>
      )}
      <div
        className={`@container grid grid-cols-1 @xs:grid-cols-2 @md:grid-cols-4 gap-4 ${isLoading ? 'hidden' : 'stagger-reveal'}`}
      >
        <StatCard
          label="Total Images"
          value={stats?.total_images ?? 0}
          icon={Image}
          color="text-primary"
        />
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
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
            {formatBytes(storageUsed)} / {formatBytes(storageTotal)}
          </p>
        </div>
      </div>
    </>
  );
}
