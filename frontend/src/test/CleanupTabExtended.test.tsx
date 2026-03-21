import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { deleted_frames: 5, freed_bytes: 10240 } })),
    put: vi.fn(() => Promise.resolve({ data: { is_active: false } })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

import CleanupTab from '../components/GoesData/CleanupTab';
import api from '../api/client';

const mockedApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };


beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/cleanup-rules') return Promise.resolve({ data: [] });
    if (url === '/satellite/frames/stats') {
      return Promise.resolve({
        data: { total_frames: 500, total_size_bytes: 5368709120, by_satellite: { 'GOES-16': { count: 300, size: 3e9 } }, by_band: { C02: { count: 200, size: 2e9 } } },
      });
    }
    return Promise.resolve({ data: {} });
  });
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
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('Run Now')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Run Now'));
    fireEvent.click(screen.getByText('Run Cleanup'));
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/satellite/cleanup/run');
    });
  });

  it('does not run cleanup when cancelled', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('Run Now')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Run Now'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(mockedApi.post).not.toHaveBeenCalled();
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
    mockedApi.get.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<CleanupTab />);
    // Should show skeleton placeholders
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
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
