import { describe, it, expect } from 'vitest';
import { filterJobsByStatus } from '../utils/jobFilterUtils';

const mockJobs = [
  { id: '1', job_type: 'fetch', status: 'completed', progress: 100, status_message: 'Done', created_at: '2024-01-01' },
  { id: '2', job_type: 'fetch', status: 'processing', progress: 50, status_message: 'Running', created_at: '2024-01-02' },
  { id: '3', job_type: 'fetch', status: 'failed', progress: 0, status_message: 'Error', created_at: '2024-01-03' },
  { id: '4', job_type: 'fetch', status: 'pending', progress: 0, status_message: 'Queued', created_at: '2024-01-04' },
  { id: '5', job_type: 'fetch', status: 'completed_partial', progress: 80, status_message: 'Partial', created_at: '2024-01-05' },
  { id: '6', job_type: 'fetch', status: 'cancelled', progress: 0, status_message: 'Cancelled', created_at: '2024-01-06' },
];

describe('filterJobsByStatus', () => {
  it('returns all jobs for "All" filter', () => {
    expect(filterJobsByStatus(mockJobs, 'All')).toHaveLength(6);
  });

  it('returns only running/pending for "Running"', () => {
    const result = filterJobsByStatus(mockJobs, 'Running');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['processing', 'pending']);
  });

  it('returns completed and completed_partial for "Completed"', () => {
    const result = filterJobsByStatus(mockJobs, 'Completed');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['completed', 'completed_partial']);
  });

  it('returns failed and cancelled for "Failed"', () => {
    const result = filterJobsByStatus(mockJobs, 'Failed');
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.status)).toEqual(['failed', 'cancelled']);
  });

  it('returns empty array when no jobs match', () => {
    const onlyCompleted = [mockJobs[0]];
    expect(filterJobsByStatus(onlyCompleted, 'Failed')).toHaveLength(0);
  });
});
