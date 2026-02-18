import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PullToRefreshIndicator from '../components/GoesData/PullToRefreshIndicator';

describe('PullToRefreshIndicator', () => {
  it('returns null when pullDistance is 0 and not refreshing', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={0} isRefreshing={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows indicator when pullDistance > 0', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={50} isRefreshing={false} />);
    expect(container.innerHTML).not.toBe('');
  });

  it('shows "Refreshing..." text when isRefreshing', () => {
    render(<PullToRefreshIndicator pullDistance={0} isRefreshing={true} />);
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  it('applies animate-spin class when refreshing', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={0} isRefreshing={true} />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not show Refreshing text when not refreshing', () => {
    render(<PullToRefreshIndicator pullDistance={40} isRefreshing={false} />);
    expect(screen.queryByText('Refreshing...')).not.toBeInTheDocument();
  });

  it('uses custom threshold for progress calculation', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={50} isRefreshing={false} threshold={100} />);
    // Should render — pullDistance > 0
    expect(container.innerHTML).not.toBe('');
  });
});
