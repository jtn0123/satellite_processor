import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ArcGauge from '../components/ui/ArcGauge';

describe('ArcGauge', () => {
  it('renders an SVG with two circles', () => {
    const { container } = render(<ArcGauge percent={50} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
  });

  it('sets correct strokeDashoffset based on percent', () => {
    const percent = 75;
    const size = 48;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const expectedOffset = circumference - (percent / 100) * circumference;

    const { container } = render(<ArcGauge percent={percent} />);
    const circles = container.querySelectorAll('circle');
    const valueCircle = circles[1]; // second circle is the value arc

    expect(valueCircle.getAttribute('stroke-dashoffset')).toBe(String(expectedOffset));
  });

  it('has full offset at 0 percent', () => {
    const size = 48;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;

    const { container } = render(<ArcGauge percent={0} />);
    const circles = container.querySelectorAll('circle');
    const valueCircle = circles[1];

    expect(valueCircle.getAttribute('stroke-dashoffset')).toBe(String(circumference));
  });

  it('has zero offset at 100 percent', () => {
    const { container } = render(<ArcGauge percent={100} />);
    const circles = container.querySelectorAll('circle');
    const valueCircle = circles[1];

    expect(valueCircle.getAttribute('stroke-dashoffset')).toBe('0');
  });

  it('applies custom color to the value circle', () => {
    const color = '#ff5500';
    const { container } = render(<ArcGauge percent={50} color={color} />);
    const valueCircle = container.querySelectorAll('circle')[1];

    expect(valueCircle.getAttribute('stroke')).toBe(color);
  });

  it('uses default color when none is provided', () => {
    const { container } = render(<ArcGauge percent={50} />);
    const valueCircle = container.querySelectorAll('circle')[1];

    expect(valueCircle.getAttribute('stroke')).toBe('var(--color-primary)');
  });

  it('applies custom size', () => {
    const size = 96;
    const { container } = render(<ArcGauge percent={50} size={size} />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe(String(size));
    expect(svg?.getAttribute('height')).toBe(String(size));
  });

  it('uses default size of 48', () => {
    const { container } = render(<ArcGauge percent={50} />);
    const svg = container.querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('applies custom strokeWidth', () => {
    const strokeWidth = 8;
    const { container } = render(<ArcGauge percent={50} strokeWidth={strokeWidth} />);
    const circles = container.querySelectorAll('circle');

    for (const circle of circles) {
      expect(circle.getAttribute('stroke-width')).toBe(String(strokeWidth));
    }
  });

  it('computes radius based on size and strokeWidth', () => {
    const size = 64;
    const strokeWidth = 6;
    const expectedRadius = (size - strokeWidth) / 2; // 29

    const { container } = render(
      <ArcGauge percent={50} size={size} strokeWidth={strokeWidth} />,
    );
    const circles = container.querySelectorAll('circle');

    for (const circle of circles) {
      expect(circle.getAttribute('r')).toBe(String(expectedRadius));
    }
  });
});
