import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComparisonModal from '../components/GoesData/ComparisonModal';

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

const frameA = {
  id: 'f1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z', file_path: '/img1.png',
  thumbnail_path: '/t1.png', file_size: 1024, width: 100, height: 100,
};
const frameB = { ...frameA, id: 'f2', satellite: 'GOES-18', file_path: '/img2.png' };

describe('ComparisonModal extended', () => {
  it('renders both frame images', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it('switches to slider mode and shows range input', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/slider/i));
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('changes slider position via range input', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/slider/i));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '30' } });
    expect((slider as HTMLInputElement).value).toBe('30');
  });

  it('swaps frames on Swap button click', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/swap/i));
    // After swap, images should still render
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
  });

  it('calls onClose on close button', () => {
    const onClose = vi.fn();
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close comparison/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows frame satellite info', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByText(/GOES-18/)).toBeInTheDocument();
  });

  it('switches back to side-by-side mode', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/slider/i));
    fireEvent.click(screen.getByText(/side by side/i));
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
