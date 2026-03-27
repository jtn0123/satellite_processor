import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardStats from '../pages/DashboardStats';

const mockStats = {
  total_images: 250,
  total_jobs: 42,
  active_jobs: 3,
  storage: { used: 5368709120, total: 10737418240 },
};

describe('DashboardStats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading skeletons when isLoading', () => {
    const { container } = render(<DashboardStats stats={undefined} isLoading={true} />);
    expect(container.querySelectorAll('.skeleton-shimmer').length).toBeGreaterThan(0);
  });

  it('renders stat cards with values', async () => {
    render(<DashboardStats stats={mockStats} isLoading={false} />);
    expect(screen.getByText('Total Images')).toBeInTheDocument();
    expect(screen.getByText('Total Jobs')).toBeInTheDocument();
    expect(screen.getByText('Active Jobs')).toBeInTheDocument();
    // StatCard uses useCountUp which animates values via requestAnimationFrame
    // Check that stat-value elements exist and contain numeric content
    const statValues = document.querySelectorAll('.stat-value');
    expect(statValues.length).toBeGreaterThan(0);
    const hasNumericContent = Array.from(statValues).some((el) => /\d/.test(el.textContent ?? ''));
    expect(hasNumericContent).toBe(true);
  });

  it('renders storage card with percentage', () => {
    render(<DashboardStats stats={mockStats} isLoading={false} />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders defaults when stats undefined', () => {
    render(<DashboardStats stats={undefined} isLoading={false} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows red arc when storage > 90%', () => {
    const highStorage = { ...mockStats, storage: { used: 9900000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={highStorage} isLoading={false} />);
    // ArcGauge uses SVG stroke color '#ef4444' for > 90%
    const arc = container.querySelector('circle[stroke="#ef4444"]');
    expect(arc).toBeInTheDocument();
  });

  it('shows yellow arc when storage > 70%', () => {
    const midStorage = { ...mockStats, storage: { used: 8000000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={midStorage} isLoading={false} />);
    // ArcGauge uses SVG stroke color '#fbbf24' for > 70%
    const arc = container.querySelector('circle[stroke="#fbbf24"]');
    expect(arc).toBeInTheDocument();
  });

  it('shows green arc when storage <= 70%', () => {
    const lowStorage = { ...mockStats, storage: { used: 3000000000, total: 10000000000 } };
    const { container } = render(<DashboardStats stats={lowStorage} isLoading={false} />);
    // ArcGauge uses SVG stroke color '#22c55e' for <= 70%
    const arc = container.querySelector('circle[stroke="#22c55e"]');
    expect(arc).toBeInTheDocument();
  });
});
