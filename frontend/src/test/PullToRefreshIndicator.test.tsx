import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PullToRefreshIndicator from '../components/GoesData/PullToRefreshIndicator';

describe('PullToRefreshIndicator', () => {
  it('renders nothing when pullDistance=0 and not refreshing', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={0} isRefreshing={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders indicator when pullDistance > 0', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={40} isRefreshing={false} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('shows "Refreshing..." text when isRefreshing', () => {
    render(<PullToRefreshIndicator pullDistance={0} isRefreshing={true} />);
    expect(screen.getByText('Refreshing...')).toBeInTheDocument();
  });

  it('applies animate-spin when refreshing', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={0} isRefreshing={true} />);
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('applies rotation transform based on pullDistance', () => {
    const { container } = render(<PullToRefreshIndicator pullDistance={40} isRefreshing={false} threshold={80} />);
    const svg = container.querySelector('svg');
    expect(svg?.style.transform).toBe('rotate(180deg)');
  });
});
