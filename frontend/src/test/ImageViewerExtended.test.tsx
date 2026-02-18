import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ImageViewer from '../components/GoesData/ImageViewer';

const makeFrame = (id: string) => ({
  id, satellite: 'GOES-16', band: 'C02', sector: 'CONUS',
  capture_time: '2026-01-01T00:00:00Z', file_path: '/img.nc', thumbnail_path: null,
  file_size: 1024, width: 1920, height: 1080, tags: [], collections: [],
});

const frame = makeFrame('f1');
const frames = [makeFrame('f1'), makeFrame('f2'), makeFrame('f3')];

describe('ImageViewer extended', () => {
  it('zooms out when zoom out button clicked', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    // Default is 100%
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Zoom out'));
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('clamps zoom to min 50%', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    // Click zoom out multiple times
    const btn = screen.getByTitle('Zoom out');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('clamps zoom to max 1000%', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const btn = screen.getByTitle('Zoom in');
    for (let i = 0; i < 25; i++) fireEvent.click(btn);
    expect(screen.getByText('1000%')).toBeInTheDocument();
  });

  it('resets zoom to 100%', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(screen.getByText('150%')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Reset zoom'));
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders correct image src', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/api/goes/frames/f1/image');
  });

  it('renders correct image alt', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('alt')).toContain('GOES-16');
  });

  it('navigates forward from middle frame', () => {
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frames[1] as never} frames={frames as never} onClose={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(frames[2]);
  });

  it('does not navigate past last frame', () => {
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frames[2] as never} frames={frames as never} onClose={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('navigates backward from middle frame', () => {
    const onNavigate = vi.fn();
    render(<ImageViewer frame={frames[1] as never} frames={frames as never} onClose={vi.fn()} onNavigate={onNavigate} />);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNavigate).toHaveBeenCalledWith(frames[0]);
  });

  it('shows counter for middle frame', () => {
    render(<ImageViewer frame={frames[1] as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('shows prev and next nav buttons for middle frame', () => {
    render(<ImageViewer frame={frames[1] as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    // Should have both prev and next nav buttons
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });

  it('handles wheel zoom in', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const panArea = screen.getByLabelText(/pan and zoom/i);
    fireEvent.wheel(panArea, { deltaY: -100 });
    // Should increase from 100%
    expect(screen.getByText('120%')).toBeInTheDocument();
  });

  it('handles wheel zoom out', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const panArea = screen.getByLabelText(/pan and zoom/i);
    fireEvent.wheel(panArea, { deltaY: 100 });
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('image is not draggable', () => {
    render(<ImageViewer frame={frame as never} frames={frames as never} onClose={vi.fn()} onNavigate={vi.fn()} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('draggable', 'false');
  });
});
