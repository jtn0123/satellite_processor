import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockShowToast = vi.fn();
vi.mock('../utils/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));

let mockJobs: unknown[] | undefined;
vi.mock('../hooks/useApi', () => ({
  useJobs: () => ({ data: mockJobs }),
}));

import { useJobToasts } from '../hooks/useJobToasts';

describe('useJobToasts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobs = undefined;
  });

  it('does nothing when no jobs', () => {
    renderHook(() => useJobToasts());
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('does not toast on initial render', () => {
    mockJobs = [{ id: 'j1', job_type: 'process', status: 'running' }];
    renderHook(() => useJobToasts());
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('toasts on job completion', () => {
    mockJobs = [{ id: 'j1234567890', job_type: 'process', status: 'running' }];
    const { rerender } = renderHook(() => useJobToasts());
    mockJobs = [{ id: 'j1234567890', job_type: 'process', status: 'completed' }];
    rerender();
    expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('completed'));
  });

  it('toasts on job failure', () => {
    mockJobs = [{ id: 'j1234567890', job_type: 'fetch', status: 'running' }];
    const { rerender } = renderHook(() => useJobToasts());
    mockJobs = [{ id: 'j1234567890', job_type: 'fetch', status: 'failed' }];
    rerender();
    expect(mockShowToast).toHaveBeenCalledWith('error', expect.stringContaining('failed'));
  });

  it('does not toast when status unchanged', () => {
    mockJobs = [{ id: 'j1', job_type: 'process', status: 'running' }];
    const { rerender } = renderHook(() => useJobToasts());
    rerender();
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('does not toast for non-terminal transitions', () => {
    mockJobs = [{ id: 'j1', job_type: 'process', status: 'queued' }];
    const { rerender } = renderHook(() => useJobToasts());
    mockJobs = [{ id: 'j1', job_type: 'process', status: 'running' }];
    rerender();
    expect(mockShowToast).not.toHaveBeenCalled();
  });
});
