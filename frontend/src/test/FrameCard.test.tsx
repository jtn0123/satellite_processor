import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameCard from '../components/GoesData/FrameCard';

const frame = {
  id: 'f1',
  satellite: 'GOES-16',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z',
  file_path: '/path/to/file',
  thumbnail_path: '/path/to/thumb',
  file_size: 1048576,
  width: 1920,
  height: 1080,
  tags: [{ id: 't1', name: 'Featured', color: '#ff0000' }],
  collections: [],
};

describe('FrameCard', () => {
  it('renders in grid mode with button element', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-label');
  });

  it('renders in list mode with button element', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="list" />);
    const btn = screen.getByRole('button');
    expect(btn).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(frame, expect.any(Object));
  });

  it('shows selected indicator when isSelected', () => {
    render(<FrameCard frame={frame as never} isSelected={true} onClick={vi.fn()} viewMode="grid" />);
    // Selected state adds a checkmark
    expect(document.querySelector('[class*="bg-primary"]')).toBeTruthy();
  });

  it('displays frame metadata', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByText(/C02/)).toBeInTheDocument();
  });

  it('shows tags', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('displays file size in list mode', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="list" />);
    expect(screen.getByText(/1.*MB/i)).toBeInTheDocument();
  });
});
