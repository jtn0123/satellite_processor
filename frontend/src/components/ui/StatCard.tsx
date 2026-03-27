import type { LucideIcon } from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  hero?: boolean;
}

/** Stat card with animated count-up number and monospace display. */
export default function StatCard({
  label,
  value,
  icon: Icon,
  color,
  hero,
}: Readonly<StatCardProps>) {
  const displayValue = useCountUp(value);

  return (
    <div
      className={`${hero ? 'glass-card-hero' : 'card card-hover'} p-4 ${hero ? 'md:col-span-2' : ''}`}
    >
      <div className="flex items-center justify-between">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <p
        className={`stat-value ${hero ? 'text-4xl md:text-5xl' : 'text-2xl'} font-bold mt-2 text-gray-900 dark:text-white animate-number-glow`}
      >
        {displayValue.toLocaleString()}
      </p>
      <p
        className={`${hero ? 'text-xs uppercase tracking-wider text-gray-400 dark:text-slate-400' : 'text-sm text-gray-600 dark:text-slate-400'} mt-0.5`}
      >
        {label}
      </p>
    </div>
  );
}
