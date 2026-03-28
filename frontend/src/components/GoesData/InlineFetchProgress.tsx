import { Loader2 } from 'lucide-react';
import { JOB_STATUS } from '../../utils/jobStatus';

interface Job {
  id: string;
  status: string;
  progress: number;
  status_message: string;
}

interface InlineFetchProgressProps {
  job: Job;
}

function getStatusContent(job: Job) {
  if (job.status === JOB_STATUS.COMPLETED) {
    return (
      <span className="text-sm text-emerald-600 dark:text-emerald-300 font-medium">
        ✓ Fetch complete
      </span>
    );
  }
  if (job.status === JOB_STATUS.FAILED) {
    return (
      <span className="text-sm text-red-600 dark:text-red-300 font-medium">✗ Fetch failed</span>
    );
  }
  return null;
}

export default function InlineFetchProgress({ job }: Readonly<InlineFetchProgressProps>) {
  const statusContent = getStatusContent(job);

  return (
    <output
      aria-live="polite"
      className="glass-t2 !border-primary/20 rounded-xl px-6 py-3 flex items-center gap-3"
    >
      {statusContent ?? (
        <>
          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm text-gray-700 dark:text-slate-300 mb-1">
              <span>{job.status_message || 'Fetching…'}</span>
              <span className="font-mono text-xs">{Math.round(job.progress)}%</span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full shadow-sm shadow-primary/30 transition-all duration-300"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        </>
      )}
    </output>
  );
}
