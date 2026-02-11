import { useEffect, useRef } from 'react';
import { useJobs } from './useApi';
import { showToast } from '../utils/toast';

interface Job {
  id: string;
  job_type: string;
  status: string;
}

/**
 * Watches job list for status transitions to completed/failed and shows toasts.
 */
export function useJobToasts() {
  const { data: jobs } = useJobs();
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!jobs) return;
    const jobList = jobs as Job[];
    const prev = prevStatusRef.current;

    if (initializedRef.current) {
      for (const job of jobList) {
        const oldStatus = prev.get(job.id);
        if (oldStatus && oldStatus !== job.status) {
          if (job.status === 'completed') {
            showToast('success', `Job "${job.job_type}" (${job.id.slice(0, 8)}) completed`);
          } else if (job.status === 'failed') {
            showToast('error', `Job "${job.job_type}" (${job.id.slice(0, 8)}) failed`);
          }
        }
      }
    }

    const next = new Map<string, string>();
    for (const job of jobList) {
      next.set(job.id, job.status);
    }
    prevStatusRef.current = next;
    initializedRef.current = true;
  }, [jobs]);
}
