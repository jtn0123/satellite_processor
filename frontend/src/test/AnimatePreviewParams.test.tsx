import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, waitFor, screen } from '@testing-library/react';
import { renderWithProviders } from './testUtils';

/**
 * JTN-465: the Animate page's Hurricane Watch (and every other quick-start)
 * was firing `/api/satellite/frames/preview-range` with `start_date` and
 * `end_date`, which the backend rejects with 422. Backend wants
 * `start_time` / `end_time`. This test pins the wire format so the bug
 * can't silently regress.
 */

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import AnimateTab from '../components/Animation/AnimateTab';

function setupBaseMocks() {
  mockGet.mockImplementation((url: string) => {
    if (url === '/satellite/animations') {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    }
    if (url === '/satellite/collections') {
      return Promise.resolve({ data: [] });
    }
    if (url === '/satellite/frames/preview-range') {
      return Promise.resolve({
        data: { frames: [], total_count: 0, capture_interval_minutes: 10 },
      });
    }
    if (url === '/satellite/products') {
      return Promise.resolve({
        data: { satellites: ['GOES-19'], default_satellite: 'GOES-19' },
      });
    }
    return Promise.resolve({ data: {} });
  });
  mockPost.mockResolvedValue({ data: { id: 'anim-1', status: 'pending' } });
}

describe('Animate preview-range wire params (JTN-465)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupBaseMocks();
  });

  it('sends start_time / end_time (not start_date / end_date) on Hurricane Watch', async () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('🌀 Hurricane Watch'));

    await waitFor(() => {
      const previewCall = mockGet.mock.calls.find(
        ([url]) => url === '/satellite/frames/preview-range',
      );
      expect(previewCall).toBeTruthy();
    });

    const previewCall = mockGet.mock.calls.find(
      ([url]) => url === '/satellite/frames/preview-range',
    );
    const params = previewCall?.[1]?.params ?? {};
    expect(params).toHaveProperty('start_time');
    expect(params).toHaveProperty('end_time');
    expect(params).not.toHaveProperty('start_date');
    expect(params).not.toHaveProperty('end_date');
  });
});
