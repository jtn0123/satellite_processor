/** Canonical job status values returned by the API. */
export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  COMPLETED_PARTIAL: 'completed_partial',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

/** Statuses that indicate a job is no longer running. */
export const TERMINAL_STATUSES = new Set<string>([
  JOB_STATUS.COMPLETED,
  JOB_STATUS.COMPLETED_PARTIAL,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
]);
