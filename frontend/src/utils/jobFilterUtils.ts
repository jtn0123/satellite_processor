export const STATUS_FILTER_OPTIONS = ['All', 'Running', 'Completed', 'Failed'] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

interface JobLike {
  readonly status: string;
}

const STATUS_FILTER_MAP: Readonly<Record<StatusFilter, ReadonlyArray<string>>> = {
  All: [],
  Running: ['pending', 'processing'],
  Completed: ['completed', 'completed_partial'],
  Failed: ['failed', 'cancelled'],
};

export function filterJobsByStatus<T extends JobLike>(jobs: ReadonlyArray<T>, filter: StatusFilter): ReadonlyArray<T> {
  if (filter === 'All') return jobs;
  const allowed = STATUS_FILTER_MAP[filter];
  return jobs.filter((j) => allowed.includes(j.status));
}
