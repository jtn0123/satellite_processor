import { useSystemStatus } from '../../hooks/useApi';
import DonutChart from './DonutChart';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';

export default function SystemMonitor() {
  const { data: status } = useSystemStatus();

  const metrics = [
    {
      label: 'CPU',
      value: status?.cpu_percent ?? 0,
      icon: Cpu,
      color: '#0ea5e9',
    },
    {
      label: 'RAM',
      value: status?.memory?.percent ?? 0,
      icon: MemoryStick,
      color: '#8b5cf6',
    },
    {
      label: 'Disk',
      value: status?.disk?.percent ?? 0,
      icon: HardDrive,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-white dark:bg-space-800/70 border border-gray-200 dark:border-space-700/50 rounded-xl p-4 flex flex-col items-center">
          <DonutChart value={m.value} color={m.color} />
          <div className="flex items-center gap-1.5 mt-2 text-sm text-gray-600 dark:text-slate-300">
            <m.icon className="w-4 h-4" style={{ color: m.color }} />
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
