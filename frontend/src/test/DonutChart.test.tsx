import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DonutChart from '../components/System/DonutChart';

describe('DonutChart', () => {
  it('renders SVG element', () => {
    const { container } = render(<DonutChart value={75} color="#22c55e" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders with custom size', () => {
    const { container } = render(<DonutChart value={50} color="#3b82f6" size={120} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('120');
  });

  it('renders circles for track and value', () => {
    const { container } = render(<DonutChart value={25} color="#ef4444" />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('handles 0 value', () => {
    const { container } = render(<DonutChart value={0} color="#22c55e" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('handles 100 value', () => {
    const { container } = render(<DonutChart value={100} color="#22c55e" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
