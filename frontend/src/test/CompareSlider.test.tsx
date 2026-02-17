import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompareSlider from '../components/GoesData/CompareSlider';

const baseProps = {
  imageUrl: '/current.png',
  prevImageUrl: '/prev.png',
  comparePosition: 50,
  onPositionChange: vi.fn(),
  frameTime: '2024-06-01T12:00:00Z',
  prevFrameTime: '2024-06-01T11:50:00Z',
  timeAgo: (d: string) => `${Math.round((Date.now() - new Date(d).getTime()) / 60000)}m ago`,
};

describe('CompareSlider', () => {
  it('renders both current and previous frame images', () => {
    render(<CompareSlider {...baseProps} />);
    expect(screen.getByAltText('Current frame')).toBeInTheDocument();
    expect(screen.getByAltText('Previous frame')).toBeInTheDocument();
  });

  it('shows "No previous frame" when prevImageUrl is null', () => {
    render(<CompareSlider {...baseProps} prevImageUrl={null} />);
    expect(screen.getByText('No previous frame')).toBeInTheDocument();
  });

  it('applies clip path based on comparePosition', () => {
    render(<CompareSlider {...baseProps} comparePosition={70} />);
    // clipPath is set via inline style; jsdom may use camelCase or kebab
    const currentImg = screen.getByAltText('Current frame');
    const clipDiv = currentImg.parentElement as HTMLElement;
    expect(clipDiv.style.clipPath).toBe('inset(0 30% 0 0)');
  });

  it('shows frame timestamp labels', () => {
    render(<CompareSlider {...baseProps} />);
    expect(screen.getByText(/Previous/)).toBeInTheDocument();
    expect(screen.getByText(/Current/)).toBeInTheDocument();
  });

  it('ArrowLeft decreases position', () => {
    const onChange = vi.fn();
    render(<CompareSlider {...baseProps} comparePosition={50} onPositionChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(49);
  });

  it('ArrowRight increases position', () => {
    const onChange = vi.fn();
    render(<CompareSlider {...baseProps} comparePosition={50} onPositionChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(51);
  });

  it('ArrowLeft clamps at 0', () => {
    const onChange = vi.fn();
    render(<CompareSlider {...baseProps} comparePosition={0} onPositionChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('ArrowRight clamps at 100', () => {
    const onChange = vi.fn();
    render(<CompareSlider {...baseProps} comparePosition={100} onPositionChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(100);
  });

  it('has correct aria attributes', () => {
    render(<CompareSlider {...baseProps} comparePosition={65} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '65');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });
});
