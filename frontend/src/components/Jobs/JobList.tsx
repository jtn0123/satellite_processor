import { useJobs, useDeleteJob } from '../../hooks/useApi';
import { Trash2, Eye, Clock, CheckCircle2, XCircle, Loader2, AlertTriangle, Download } from 'lucide-react';

interface Job {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  status_message: string;
  created_at: string;
}

const statusConfig: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  processing: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  completed: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
  cancelled: { icon: AlertTriangle, color: 'text-slate-400', bg: 'bg-slate-400/10' },
};

interface Props {
  onSelect?: (id: string) => void;
  limit?: number;
}

export default function JobList({ onSelect, limit }: Readonly<Props>) {
  const { data: jobs = [], isLoading } = useJobs();
  const deleteJob = useDeleteJob();

  const displayed = limit ? (jobs as Job[]).slice(0, limit) : (jobs as Job[]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {["a","b","c"].map((k) => (
          <div key={k} className="h-14 bg-card rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (displayed.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-8">No jobs yet</p>;
  }

  return (
    <div className="space-y-2">
      {displayed.map((job) => {
        const cfg = statusConfig[job.status] || statusConfig.pending;
        const Icon = cfg.icon;
        return (
          <div
            key={job.id}
            role="button"
            tabIndex={0}
            className="flex items-center gap-3 bg-card border border-subtle rounded-lg px-4 py-3 hover:bg-card-hover cursor-pointer group transition-colors"
            onClick={() => onSelect?.(job.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(job.id); } }}
          >
            <div className={`p-1.5 rounded-lg ${cfg.bg}`}>
              <Icon
                className={`w-4 h-4 ${cfg.color} ${job.status === 'processing' ? 'animate-spin' : ''}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{job.job_type}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                  {job.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {job.status_message || `Job ${job.id.slice(0, 8)}`}
              </p>
            </div>
            {job.status === 'processing' && (
              <div className="w-20 h-1.5 bg-space-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}
            <span className="text-xs text-slate-500 hidden sm:block">
              {new Date(job.created_at).toLocaleString()}
            </span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {job.status === 'completed' && (
                <a
                  href={`/api/jobs/${job.id}/download`}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 hover:bg-space-700 rounded-lg text-slate-400 hover:text-primary"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(job.id);
                }}
                className="p-1.5 hover:bg-space-700 rounded-lg text-slate-400 hover:text-white"
              >
                <Eye className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (globalThis.confirm('Delete this job? This cannot be undone.')) {
                    deleteJob.mutate(job.id);
                  }
                }}
                className="p-1.5 hover:bg-space-700 rounded-lg text-slate-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
