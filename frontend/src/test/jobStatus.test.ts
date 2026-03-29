import { describe, it, expect } from 'vitest';
import { JOB_STATUS, TERMINAL_STATUSES } from '../utils/jobStatus';

describe('JOB_STATUS', () => {
  it('contains all expected statuses', () => {
    expect(JOB_STATUS.PENDING).toBe('pending');
    expect(JOB_STATUS.PROCESSING).toBe('processing');
    expect(JOB_STATUS.COMPLETED).toBe('completed');
    expect(JOB_STATUS.COMPLETED_PARTIAL).toBe('completed_partial');
    expect(JOB_STATUS.FAILED).toBe('failed');
    expect(JOB_STATUS.CANCELLED).toBe('cancelled');
  });

  it('has exactly 6 statuses', () => {
    expect(Object.keys(JOB_STATUS)).toHaveLength(6);
  });
});

describe('TERMINAL_STATUSES', () => {
  it('includes completed, completed_partial, failed, cancelled', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true);
    expect(TERMINAL_STATUSES.has('completed_partial')).toBe(true);
    expect(TERMINAL_STATUSES.has('failed')).toBe(true);
    expect(TERMINAL_STATUSES.has('cancelled')).toBe(true);
  });

  it('excludes running statuses', () => {
    expect(TERMINAL_STATUSES.has('pending')).toBe(false);
    expect(TERMINAL_STATUSES.has('processing')).toBe(false);
  });

  it('has exactly 4 entries', () => {
    expect(TERMINAL_STATUSES.size).toBe(4);
  });
});
