import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Skeleton from '../components/GoesData/Skeleton';

describe('Skeleton', () => {
  it('renders a single text skeleton by default', () => {
    const { container } = render(<Skeleton />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(1);
  });

  it('renders multiple skeletons when count > 1', () => {
    const { container } = render(<Skeleton count={4} />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(4);
  });

  it('renders card variant with aspect-video', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.querySelector('.aspect-video')).toBeTruthy();
  });

  it('renders thumbnail variant with aspect-video', () => {
    const { container } = render(<Skeleton variant="thumbnail" />);
    expect(container.querySelector('.aspect-video')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="my-skel" />);
    expect(container.querySelector('.my-skel')).toBeTruthy();
  });
});
