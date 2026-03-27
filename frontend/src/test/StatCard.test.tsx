import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity } from 'lucide-react';
import StatCard from '../components/ui/StatCard';

describe('StatCard', () => {
  beforeEach(() => {
    // useCountUp uses requestAnimationFrame; advance time automatically
    // so the animated value resolves immediately
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the label text', () => {
    render(<StatCard label="Total Images" value={42} icon={Activity} color="text-blue-500" />);
    expect(screen.getByText('Total Images')).toBeInTheDocument();
  });

  it('renders the icon', () => {
    const { container } = render(
      <StatCard label="Jobs" value={10} icon={Activity} color="text-green-500" />,
    );
    // Lucide icons render as SVG elements
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies the icon color class', () => {
    const { container } = render(
      <StatCard label="Jobs" value={10} icon={Activity} color="text-red-500" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.classList.contains('text-red-500')).toBe(true);
  });

  it('has stat-value class on the number element', () => {
    const { container } = render(
      <StatCard label="Count" value={99} icon={Activity} color="text-blue-500" />,
    );
    const statValue = container.querySelector('.stat-value');
    expect(statValue).toBeInTheDocument();
  });

  it('applies glass-card-hero class when hero=true', () => {
    const { container } = render(
      <StatCard label="Main Stat" value={100} icon={Activity} color="text-blue-500" hero />,
    );
    const card = container.firstElementChild;
    expect(card?.classList.contains('glass-card-hero')).toBe(true);
  });

  it('does not apply glass-card-hero class when hero is not set', () => {
    const { container } = render(
      <StatCard label="Normal" value={50} icon={Activity} color="text-blue-500" />,
    );
    const card = container.firstElementChild;
    expect(card?.classList.contains('glass-card-hero')).toBe(false);
  });

  it('applies card and card-hover classes when not hero', () => {
    const { container } = render(
      <StatCard label="Normal" value={50} icon={Activity} color="text-blue-500" />,
    );
    const card = container.firstElementChild;
    expect(card?.classList.contains('card')).toBe(true);
    expect(card?.classList.contains('card-hover')).toBe(true);
  });

  it('applies md:col-span-2 when hero=true', () => {
    const { container } = render(
      <StatCard label="Hero" value={200} icon={Activity} color="text-blue-500" hero />,
    );
    const card = container.firstElementChild;
    expect(card?.className).toContain('md:col-span-2');
  });

  it('does not apply md:col-span-2 when not hero', () => {
    const { container } = render(
      <StatCard label="Normal" value={50} icon={Activity} color="text-blue-500" />,
    );
    const card = container.firstElementChild;
    expect(card?.className).not.toContain('md:col-span-2');
  });

  it('uses larger text classes for hero stat value', () => {
    const { container } = render(
      <StatCard label="Hero" value={300} icon={Activity} color="text-blue-500" hero />,
    );
    const statValue = container.querySelector('.stat-value');
    expect(statValue?.className).toContain('text-4xl');
  });

  it('uses text-2xl for non-hero stat value', () => {
    const { container } = render(
      <StatCard label="Normal" value={50} icon={Activity} color="text-blue-500" />,
    );
    const statValue = container.querySelector('.stat-value');
    expect(statValue?.className).toContain('text-2xl');
    expect(statValue?.className).not.toContain('text-4xl');
  });
});
