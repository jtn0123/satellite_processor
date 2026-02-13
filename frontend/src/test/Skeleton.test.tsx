import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Skeleton from '../components/GoesData/Skeleton';

describe('Skeleton', () => {
  it('renders single text skeleton by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders multiple items', () => {
    const { container } = render(<Skeleton count={3} />);
    const items = container.querySelectorAll('.animate-pulse');
    expect(items.length).toBe(3);
  });

  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />);
    expect(container.querySelector('.aspect-video')).toBeTruthy();
  });

  it('renders thumbnail variant', () => {
    const { container } = render(<Skeleton variant="thumbnail" />);
    expect(container.querySelector('.aspect-video')).toBeTruthy();
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeTruthy();
  });
});
