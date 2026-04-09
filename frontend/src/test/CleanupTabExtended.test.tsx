import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

import CleanupTab from '../components/GoesData/CleanupTab';

const server = setupMswServer();

const STATS_WITH_DATA = {
  total_frames: 500,
  total_size_bytes: 5368709120,
  by_satellite: { 'GOES-16': { count: 300, size: 3e9 } },
  by_band: { C02: { count: 200, size: 2e9 } },
};

beforeEach(() => {
  server.use(http.get('*/api/satellite/frames/stats', () => HttpResponse.json(STATS_WITH_DATA)));
});

describe('CleanupTab - confirm before cleanup', () => {
  it('shows confirm dialog before running cleanup', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('Run Now')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Run Now'));
    expect(screen.getByText('Run cleanup now?')).toBeInTheDocument();
    expect(screen.getByText(/permanently delete/)).toBeInTheDocument();
  });

  it('runs cleanup when confirmed', async () => {
    const runSpy = vi.fn();
    server.use(
      http.post('*/api/satellite/cleanup/run', () => {
        runSpy();
        return HttpResponse.json({ deleted_frames: 5, freed_bytes: 10240 });
      }),
    );
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('Run Now')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Run Now'));
    fireEvent.click(screen.getByText('Run Cleanup'));
    await waitFor(() => {
      expect(runSpy).toHaveBeenCalled();
    });
  });

  it('does not run cleanup when cancelled', async () => {
    const runSpy = vi.fn();
    server.use(
      http.post('*/api/satellite/cleanup/run', () => {
        runSpy();
        return HttpResponse.json({ deleted_frames: 0, freed_bytes: 0 });
      }),
    );
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('Run Now')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Run Now'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(runSpy).not.toHaveBeenCalled();
  });
});

describe('CleanupTab - storage stats display', () => {
  it('renders storage stats when available', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  it('shows skeleton when stats loading', () => {
    server.use(
      http.get('*/api/satellite/frames/stats', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
      http.get('*/api/satellite/cleanup-rules', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderWithProviders(<CleanupTab />);
    // Should show skeleton placeholders
    expect(document.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);
  });
});

describe('CleanupTab - create rule form', () => {
  it('shows create form when New Rule clicked', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('New Rule')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Rule'));
    expect(screen.getByLabelText('Rule name')).toBeInTheDocument();
  });

  it('hides create form when Cancel clicked', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('New Rule')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Rule'));
    expect(screen.getByLabelText('Rule name')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('Rule name')).not.toBeInTheDocument();
  });
});
