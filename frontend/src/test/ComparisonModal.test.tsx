import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComparisonModal from '../components/GoesData/ComparisonModal';

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

const frame = {
  id: 'f1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z', file_path: '/p.png',
  thumbnail_path: '/t.png', file_size: 1024,
};

describe('ComparisonModal', () => {
  it('renders dialog', () => {
    render(<ComparisonModal frameA={frame as never} frameB={{ ...frame, id: 'f2' } as never} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onClose on close button', () => {
    const onClose = vi.fn();
    render(<ComparisonModal frameA={frame as never} frameB={{ ...frame, id: 'f2' } as never} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows mode toggle buttons', () => {
    render(<ComparisonModal frameA={frame as never} frameB={{ ...frame, id: 'f2' } as never} onClose={vi.fn()} />);
    expect(screen.getByText(/side by side/i)).toBeInTheDocument();
  });
});
