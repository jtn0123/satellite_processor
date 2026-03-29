import { describe, it, expect } from 'vitest';
import { filterJobsByStatus, STATUS_FILTER_OPTIONS } from '../utils/jobFilterUtils';

const jobs = [
  { status: 'pending' },
  { status: 'processing' },
  { status: 'completed' },
  { status: 'completed_partial' },
  { status: 'failed' },
  { status: 'cancelled' },
] as const;

describe('STATUS_FILTER_OPTIONS', () => {
  it('contains All, Running, Completed, Failed', () => {
    expect(STATUS_FILTER_OPTIONS).toEqual(['All', 'Running', 'Completed', 'Failed']);
  });
});

describe('filterJobsByStatus', () => {
  it('"All" returns all jobs', () => {
    expect(filterJobsByStatus(jobs, 'All')).toEqual(jobs);
  });

  it('"Running" returns pending and processing', () => {
    const result = filterJobsByStatus(jobs, 'Running');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['pending', 'processing']);
  });

  it('"Completed" returns completed and completed_partial', () => {
    const result = filterJobsByStatus(jobs, 'Completed');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['completed', 'completed_partial']);
  });

  it('"Failed" returns failed and cancelled', () => {
    const result = filterJobsByStatus(jobs, 'Failed');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['failed', 'cancelled']);
  });

  it('returns empty array when no jobs match', () => {
    const onlyPending = [{ status: 'pending' }];
    expect(filterJobsByStatus(onlyPending, 'Failed')).toEqual([]);
  });

  it('handles empty input', () => {
    expect(filterJobsByStatus([], 'Running')).toEqual([]);
  });
});
