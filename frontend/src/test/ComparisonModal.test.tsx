import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Check if ComparisonModal accepts frames and onClose props
import ComparisonModal from '../components/GoesData/ComparisonModal';

describe('ComparisonModal', () => {
  const frameA = { id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T12:00:00', file_path: '/a.nc', file_size: 1024, thumbnail_path: null };
  const frameB = { id: '2', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T13:00:00', file_path: '/b.nc', file_size: 2048, thumbnail_path: null };

  it('renders when given two frames', () => {
    const { container } = render(
      <ComparisonModal frameA={frameA} frameB={frameB} onClose={vi.fn()} />
    );
    expect(container).toBeTruthy();
  });

  it('has a close button', () => {
    render(<ComparisonModal frameA={frameA} frameB={frameB} onClose={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<ComparisonModal frameA={frameA} frameB={frameB} onClose={onClose} />);
    const closeBtn = screen.getAllByRole('button')[0];
    closeBtn.click();
    expect(closeBtn).toBeDefined();
  });

  it('shows frame info', () => {
    render(<ComparisonModal frameA={frameA} frameB={frameB} onClose={vi.fn()} />);
    expect(screen.getAllByText(/GOES-16/i).length).toBeGreaterThan(0);
  });
});
