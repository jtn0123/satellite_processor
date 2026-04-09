export const STATUS_FILTER_OPTIONS = ['All', 'Running', 'Completed', 'Failed'] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

interface JobLike {
  readonly status: string;
}

import { JOB_STATUS } from './jobStatus';

const STATUS_FILTER_MAP: Readonly<Record<StatusFilter, readonly string[]>> = {
  All: [],
  Running: [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING],
  Completed: [JOB_STATUS.COMPLETED, JOB_STATUS.COMPLETED_PARTIAL],
  Failed: [JOB_STATUS.FAILED, JOB_STATUS.CANCELLED],
};

export function filterJobsByStatus<T extends JobLike>(
  jobs: readonly T[],
  filter: StatusFilter,
): readonly T[] {
  if (filter === 'All') return jobs;
  const allowed = STATUS_FILTER_MAP[filter];
  return jobs.filter((j) => allowed.includes(j.status));
}

/**
 * Serialized backend value for each UI filter option. Sent as the `status`
 * query param on `/api/jobs` so the server can narrow the result set
 * (the backend multi-status syntax is a comma-separated list).
 *
 * Used by `useJobs()` — the frontend still double-filters client-side so
 * the UI stays correct while the backend half of JTN-412 is in flight.
 */
export const STATUS_FILTER_TO_BACKEND: Readonly<Record<StatusFilter, string | undefined>> = {
  All: undefined,
  Running: STATUS_FILTER_MAP.Running.join(','),
  Completed: STATUS_FILTER_MAP.Completed.join(','),
  Failed: STATUS_FILTER_MAP.Failed.join(','),
};
