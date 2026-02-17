import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PullToRefreshIndicator from '../components/GoesData/PullToRefreshIndicator';

describe('PullToRefreshIndicator', () => {
  it('renders nothing when pullDistance is 0 and not refreshing', () => {
    const { container } = render(
      <PullToRefreshIndicator pullDistance={0} isRefreshing={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows indicator when pulling', () => {
    const { container } = render(
      <PullToRefreshIndicator pullDistance={40} isRefreshing={false} />
    );
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('shows refreshing text when refreshing', () => {
    render(
      <PullToRefreshIndicator pullDistance={0} isRefreshing={true} />
    );
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  it('applies spin animation when refreshing', () => {
    const { container } = render(
      <PullToRefreshIndicator pullDistance={0} isRefreshing={true} />
    );
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });
});
