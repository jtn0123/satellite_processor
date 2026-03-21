export const STATUS_FILTER_OPTIONS = ['All', 'Running', 'Completed', 'Failed'] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

interface JobLike {
  readonly status: string;
}

import { JOB_STATUS } from './jobStatus';

const STATUS_FILTER_MAP: Readonly<Record<StatusFilter, ReadonlyArray<string>>> = {
  All: [],
  Running: [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING],
  Completed: [JOB_STATUS.COMPLETED, JOB_STATUS.COMPLETED_PARTIAL],
  Failed: [JOB_STATUS.FAILED, JOB_STATUS.CANCELLED],
};

export function filterJobsByStatus<T extends JobLike>(jobs: ReadonlyArray<T>, filter: StatusFilter): ReadonlyArray<T> {
  if (filter === 'All') return jobs;
  const allowed = STATUS_FILTER_MAP[filter];
  return jobs.filter((j) => allowed.includes(j.status));
}
