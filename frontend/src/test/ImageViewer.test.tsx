import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageViewer from '../components/GoesData/ImageViewer';

const frame = { id: 'f1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS', capture_time: '2026-01-01T00:00:00Z', file_path: '', thumbnail_path: '', file_size: 1024, width: 1920, height: 1080, tags: [], collections: [] };
const frames = [frame, { ...frame, id: 'f2' }, { ...frame, id: 'f3' }];

describe('ImageViewer', () => {
  it('renders dialog with aria-label', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByRole('application', { name: /pan and zoom/i })).toBeInTheDocument();
  });

  it('shows frame metadata', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('GOES-16')).toBeInTheDocument();
    expect(screen.getByText(/Band C02/)).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('navigates to next frame on ArrowRight', () => {
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(frames[1]);
  });

  it('navigates to prev frame on ArrowLeft (no-op at first)', () => {
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows zoom controls', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Reset zoom')).toBeInTheDocument();
  });

  it('zooms in when zoom button clicked', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('shows navigation arrows', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    // First frame: should have next but not prev
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(3);
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
