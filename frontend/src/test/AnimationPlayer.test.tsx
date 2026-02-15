import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import AnimationPlayer from '../components/GoesData/AnimationPlayer';

const frames = [
  { id: 'f1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS', capture_time: '2026-01-01T12:00:00Z', file_path: '/p1.png', thumbnail_path: '/t1.png', file_size: 1024, width: 100, height: 100, tags: [], collections: [] },
  { id: 'f2', satellite: 'GOES-16', band: 'C02', sector: 'CONUS', capture_time: '2026-01-01T12:10:00Z', file_path: '/p2.png', thumbnail_path: '/t2.png', file_size: 1024, width: 100, height: 100, tags: [], collections: [] },
  { id: 'f3', satellite: 'GOES-16', band: 'C02', sector: 'CONUS', capture_time: '2026-01-01T12:20:00Z', file_path: '/p3.png', thumbnail_path: '/t3.png', file_size: 1024, width: 100, height: 100, tags: [], collections: [] },
];

describe('AnimationPlayer', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('renders with frame counter', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument();
  });

  it('has play button', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('toggles play/pause', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Pause'));
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('navigates forward with next button', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Next frame'));
    expect(screen.getByText(/2\s*\/\s*3/)).toBeInTheDocument();
  });

  it('navigates backward with prev button', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Next frame'));
    fireEvent.click(screen.getByLabelText('Previous frame'));
    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<AnimationPlayer frames={frames as never[]} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close player'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows speed control', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    expect(screen.getByText('1x')).toBeInTheDocument();
  });

  it('cycles speed on click', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('1x'));
    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('has loop toggle', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/loop/i)).toBeInTheDocument();
  });

  it('renders slider/scrubber', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
  });

  it('scrubber changes frame', () => {
    render(<AnimationPlayer frames={frames as never[]} onClose={vi.fn()} />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(screen.getByText(/3\s*\/\s*3/)).toBeInTheDocument();
  });
});
