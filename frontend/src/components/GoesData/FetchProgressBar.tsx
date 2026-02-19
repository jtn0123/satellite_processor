import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import api from '../../api/client';

interface JobSummary {
  id: string;
  name: string | null;
  status: string;
  progress: number;
  status_message: string;
  created_at: string;
}

interface JobListResponse {
  items: JobSummary[];
  total: number;
}

export default function FetchProgressBar() {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<JobListResponse>({
    queryKey: ['active-jobs'],
    queryFn: () =>
      api.get('/jobs', { params: { status: 'processing,pending', limit: 10 } }).then((r) => r.data),
    refetchInterval: 3000,
  });

  const jobs = data?.items ?? [];
  const activeJob = jobs.find((j) => j.status === 'processing');
  const pendingCount = jobs.filter((j) => j.status === 'pending').length;

  if (jobs.length === 0) return null;

  return (
    <div className="fixed bottom-0 md:bottom-0 left-0 right-0 z-50 mb-[env(safe-area-inset-bottom)] max-md:bottom-16">
      <div className="bg-gray-900/95 dark:bg-slate-900/95 backdrop-blur border-t border-gray-700 dark:border-slate-700">
        {/* Main bar */}
        <button
          type="button"
          className="w-full flex items-center gap-3 px-4 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50 bg-transparent border-none text-left"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse job list' : 'Expand job list'}
        >
          {activeJob ? (
            <>
              <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">
                  {activeJob.name ?? 'Processing...'}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${activeJob.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{activeJob.progress}%</span>
                </div>
              </div>
              {pendingCount > 0 && (
                <span className="text-xs text-gray-400">+{pendingCount} queued</span>
              )}
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-sm text-gray-300">{pendingCount} job{pendingCount === 1 ? '' : 's'} queued</span>
            </>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>

        {/* Expanded job list */}
        {expanded && (
          <div className="border-t border-gray-700 dark:border-slate-700 max-h-48 overflow-y-auto">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 dark:border-slate-800 last:border-0"
              >
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    job.status === 'processing'
                      ? 'bg-blue-400 animate-pulse'
                      : 'bg-yellow-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate">{job.name ?? job.id}</div>
                  <div className="text-[10px] text-gray-500">
                    {job.status_message || job.status}
                  </div>
                </div>
                {job.status === 'processing' && (
                  <span className="text-xs text-gray-400">{job.progress}%</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
