import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Skeleton from '../components/GoesData/Skeleton';

describe('Skeleton', () => {
  it('renders single text skeleton by default', () => {
    const { container } = render(<Skeleton />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(1);
  });

  it('renders multiple skeletons with count', () => {
    const { container } = render(<Skeleton count={5} />);
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBe(5);
  });

  it('renders card variant with aspect-video', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.querySelector('.aspect-video')).toBeInTheDocument();
  });

  it('renders thumbnail variant with aspect-video', () => {
    const { container } = render(<Skeleton variant="thumbnail" />);
    expect(container.querySelector('.aspect-video')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="my-class" />);
    expect(container.querySelector('.my-class')).toBeInTheDocument();
  });

  it('card variant renders inner text placeholders', () => {
    const { container } = render(<Skeleton variant="card" />);
    const pulses = container.querySelectorAll('.animate-pulse');
    // aspect-video + 2 text lines = 3
    expect(pulses.length).toBe(3);
  });
});
