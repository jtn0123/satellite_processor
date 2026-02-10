import { useSystemStatus } from '../../hooks/useApi';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Cpu, HardDrive, MemoryStick } from 'lucide-react';

export default function SystemMonitor() {
  const { data: status } = useSystemStatus();

  const metrics = [
    {
      label: 'CPU',
      value: status?.cpu_percent ?? 0,
      icon: Cpu,
      color: '#06b6d4',
    },
    {
      label: 'RAM',
      value: status?.ram_percent ?? 0,
      icon: MemoryStick,
      color: '#8b5cf6',
    },
    {
      label: 'Disk',
      value: status?.disk_percent ?? 0,
      icon: HardDrive,
      color: '#f59e0b',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {metrics.map((m) => (
        <div key={m.label} className="bg-slate-800 rounded-xl p-4 flex flex-col items-center">
          <div className="w-24 h-24 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { value: m.value },
                    { value: 100 - m.value },
                  ]}
                  innerRadius={30}
                  outerRadius={40}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill={m.color} />
                  <Cell fill="#334155" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold">{Math.round(m.value)}%</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-sm text-slate-300">
            <m.icon className="w-4 h-4" style={{ color: m.color }} />
            {m.label}
          </div>
        </div>
      ))}
    </div>
  );
}
