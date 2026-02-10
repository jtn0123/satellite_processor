import { useNavigate } from 'react-router-dom';
import { useImages, useJobs, useSystemStatus } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { Upload, FlaskConical, Image, ListTodo, Cpu, Activity } from 'lucide-react';
import JobList from '../components/Jobs/JobList';
import SystemMonitor from '../components/System/SystemMonitor';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const navigate = useNavigate();
  const { data: images = [] } = useImages();
  const { data: jobs = [] } = useJobs();
  const { data: system } = useSystemStatus();

  const stats = [
    { label: 'Total Images', value: (images as unknown[]).length, icon: Image, color: 'text-cyan-400' },
    { label: 'Total Jobs', value: (jobs as unknown[]).length, icon: ListTodo, color: 'text-violet-400' },
    {
      label: 'Active Jobs',
      value: (jobs as { status: string }[]).filter((j) => j.status === 'processing').length,
      icon: Activity,
      color: 'text-amber-400',
    },
    { label: 'CPU Usage', value: `${system?.cpu_percent ?? 0}%`, icon: Cpu, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Satellite image processing overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-bold mt-2">{s.value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/upload')}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" /> Upload Images
        </button>
        <button
          onClick={() => navigate('/process')}
          className="flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors"
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

        {/* System */}
        <div>
          <h2 className="text-lg font-semibold mb-3">System</h2>
          <SystemMonitor />
        </div>
      </div>
    </div>
  );
}
