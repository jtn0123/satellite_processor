import { useJob } from '../../hooks/useApi';
import { useWebSocket } from '../../hooks/useWebSocket';
import VideoPlayer from '../VideoPlayer/VideoPlayer';
import { Download, ArrowLeft } from 'lucide-react';

function statusBadgeClass(status: string): string {
  if (status === 'completed') return 'bg-green-400/10 text-green-400';
  if (status === 'failed') return 'bg-red-400/10 text-red-400';
  return 'bg-blue-400/10 text-blue-400';
}

interface Props {
  jobId: string;
  onBack: () => void;
}

export default function JobMonitor({ jobId, onBack }: Readonly<Props>) {
  const { data: job } = useJob(jobId);
  const { data: wsData, connected } = useWebSocket(jobId);

  const progress = wsData?.progress ?? job?.progress ?? 0;
  const message = wsData?.message ?? job?.status_message ?? '';
  const status = wsData?.status ?? job?.status ?? 'pending';

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white focus-ring rounded-lg px-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Jobs
      </button>

      <div className="bg-card border border-subtle rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Job {jobId.slice(0, 8)}</h2>
          <div className="flex items-center gap-2">
            {connected && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Live
              </span>
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}
            >
              {status}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-slate-300">{message}</span>
            <span className="text-gray-500 dark:text-slate-400">{progress}%</span>
          </div>
          <div className="w-full h-3 bg-space-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === 'failed' ? 'bg-red-500' : 'bg-primary'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Job details */}
        {job && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <div className="bg-space-700/50 border border-subtle rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Type</p>
              <p className="font-medium">{job.job_type}</p>
            </div>
            <div className="bg-space-700/50 border border-subtle rounded-lg px-3 py-2">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Created</p>
              <p className="font-medium">{new Date(job.created_at).toLocaleString()}</p>
            </div>
            {job.started_at && (
              <div className="bg-space-700/50 border border-subtle rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Started</p>
                <p className="font-medium">{new Date(job.started_at).toLocaleString()}</p>
              </div>
            )}
            {job.completed_at && (
              <div className="bg-space-700/50 border border-subtle rounded-lg px-3 py-2">
                <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase">Completed</p>
                <p className="font-medium">{new Date(job.completed_at).toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {job?.error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-300">
            {job.error}
          </div>
        )}
      </div>

      {/* Output */}
      {status === 'completed' && (
        <div className="space-y-4">
          {job?.output_path && <VideoPlayer src={`/api/jobs/${jobId}/output`} />}
          <a
            href={`/api/jobs/${jobId}/download`}
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-gray-900 dark:text-white rounded-xl text-sm font-medium transition-colors focus-ring"
          >
            <Download className="w-4 h-4" /> Download Output
          </a>
        </div>
      )}
    </div>
  );
}
