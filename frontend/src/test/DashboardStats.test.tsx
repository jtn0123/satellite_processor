import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardStats from '../pages/DashboardStats';

const mockStats = {
  total_images: 250,
  total_jobs: 42,
  active_jobs: 3,
  storage: { used: 5368709120, total: 10737418240 },
};

describe('DashboardStats', () => {
  it('renders loading skeletons when isLoading', () => {
    const { container } = render(<DashboardStats stats={undefined} isLoading={true} />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders stat cards with values', () => {
    render(<DashboardStats stats={mockStats} isLoading={false} />);
    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('Total Images')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Total Jobs')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Active Jobs')).toBeInTheDocument();
  });

  it('renders storage card with percentage', () => {
    render(<DashboardStats stats={mockStats} isLoading={false} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders defaults when stats undefined', () => {
    render(<DashboardStats stats={undefined} isLoading={false} />);
    expect(screen.getAllByText('0').length).toBe(3);
  });

  it('shows red bar when storage > 90%', () => {
    const highStorage = { ...mockStats, storage: { used: 9900000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={highStorage} isLoading={false} />);
    expect(container.querySelector('.bg-red-400')).toBeInTheDocument();
  });

  it('shows yellow bar when storage > 70%', () => {
    const midStorage = { ...mockStats, storage: { used: 8000000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={midStorage} isLoading={false} />);
    expect(container.querySelector('.bg-yellow-400')).toBeInTheDocument();
  });

  it('shows green bar when storage <= 70%', () => {
    const lowStorage = { ...mockStats, storage: { used: 3000000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={lowStorage} isLoading={false} />);
    expect(container.querySelector('.bg-emerald-400')).toBeInTheDocument();
  });
});
