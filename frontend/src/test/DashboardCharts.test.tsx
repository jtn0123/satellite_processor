import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardCharts from '../pages/DashboardCharts';

const mockStats = {
  total_frames: 1500,
  frames_by_satellite: { 'GOES-16': 800, 'GOES-18': 700 },
  last_fetch_time: '2025-01-15T10:30:00Z',
  active_schedules: 3,
  recent_jobs: [],
  storage_by_satellite: { 'GOES-16': 1073741824, 'GOES-18': 536870912 },
  storage_by_band: {},
};

describe('DashboardCharts', () => {
  it('renders loading skeleton when isLoading', () => {
    const { container } = render(<DashboardCharts goesStats={undefined} isLoading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('returns null when no stats', () => {
    const { container } = render(<DashboardCharts goesStats={undefined} isLoading={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when total_frames is 0', () => {
    const { container } = render(<DashboardCharts goesStats={{ ...mockStats, total_frames: 0 }} isLoading={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders satellite data heading', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getByText('Satellite Data')).toBeInTheDocument();
  });

  it('renders total frames count', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.getByText('Total Frames')).toBeInTheDocument();
  });

  it('renders frames by satellite', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getAllByText('GOES-16').length).toBeGreaterThan(0);
    expect(screen.getAllByText('GOES-18').length).toBeGreaterThan(0);
  });

  it('renders last fetch time', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getByText('Last Fetch')).toBeInTheDocument();
  });

  it('renders Never when no last_fetch_time', () => {
    render(<DashboardCharts goesStats={{ ...mockStats, last_fetch_time: null }} isLoading={false} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('renders active schedules', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Active Schedules')).toBeInTheDocument();
  });

  it('renders storage by satellite bars', () => {
    render(<DashboardCharts goesStats={mockStats} isLoading={false} />);
    expect(screen.getByText('Storage by Satellite')).toBeInTheDocument();
  });

  it('hides storage section when empty', () => {
    render(<DashboardCharts goesStats={{ ...mockStats, storage_by_satellite: {} }} isLoading={false} />);
    expect(screen.queryByText('Storage by Satellite')).not.toBeInTheDocument();
  });
});
