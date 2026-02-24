import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ShimmerLoader from '../components/GoesData/ShimmerLoader';

describe('ShimmerLoader', () => {
  it('renders shimmer element', () => {
    render(<ShimmerLoader />);
    expect(screen.getByTestId('shimmer-loader')).toBeInTheDocument();
  });

  it('has gradient animation styling', () => {
    render(<ShimmerLoader />);
    const loader = screen.getByTestId('shimmer-loader');
    const inner = loader.querySelector('.animate-shimmer');
    expect(inner).toBeTruthy();
  });
});
