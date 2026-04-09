import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// JTN-391: verify that job-creation and fetch-triggering mutations
// attach a fresh Idempotency-Key header on every submission so the
// backend can dedupe accidental duplicate clicks.

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { id: 'job-1', job_id: 'job-1' } })),
  },
}));

import api from '../api/client';
import { useCreateJob } from '../hooks/useApi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.post.mockResolvedValue({ data: { id: 'job-1', job_id: 'job-1' } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Idempotency-Key header (JTN-391)', () => {
  it('useCreateJob attaches an Idempotency-Key header to POST /jobs', async () => {
    const { result } = renderHook(() => useCreateJob(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        job_type: 'image_process',
        params: {},
        input_path: '/tmp/a',
      });
    });

    expect(mockedApi.post).toHaveBeenCalledWith(
      '/jobs',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.stringMatching(/^[0-9a-fA-F-]{36}$/),
        }),
      }),
    );
  });

  it('useCreateJob generates a different key per invocation', async () => {
    const { result } = renderHook(() => useCreateJob(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        job_type: 'image_process',
        params: {},
        input_path: '/tmp/a',
      });
    });
    await act(async () => {
      await result.current.mutateAsync({
        job_type: 'image_process',
        params: {},
        input_path: '/tmp/b',
      });
    });

    expect(mockedApi.post).toHaveBeenCalledTimes(2);
    const firstKey = mockedApi.post.mock.calls[0][2].headers['Idempotency-Key'];
    const secondKey = mockedApi.post.mock.calls[1][2].headers['Idempotency-Key'];
    expect(firstKey).not.toEqual(secondKey);
    // Both should be valid UUID-shaped strings
    expect(firstKey).toMatch(/^[0-9a-fA-F-]{36}$/);
    expect(secondKey).toMatch(/^[0-9a-fA-F-]{36}$/);
  });
});
