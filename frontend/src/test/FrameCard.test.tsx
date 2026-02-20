import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameCard from '../components/GoesData/FrameCard';

const frame = {
  id: 'f1',
  satellite: 'GOES-16',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z',
  file_path: '/path/to/file',
  thumbnail_path: '/path/to/thumb', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
  file_size: 1048576,
  width: 1920,
  height: 1080,
  tags: [{ id: 't1', name: 'Featured', color: '#ff0000' }],
  collections: [],
};

describe('FrameCard', () => {
  it('renders in grid mode with buttons', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders in list mode', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="list" />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('calls onClick when thumbnail clicked', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    const btn = screen.getByRole('button', { name: /GOES-16/ });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith(frame, expect.any(Object));
  });

  it('shows selected indicator when isSelected', () => {
    render(<FrameCard frame={frame as never} isSelected={true} onClick={vi.fn()} viewMode="grid" />);
    expect(document.querySelector('[class*="bg-primary"]')).toBeTruthy();
  });

  it('displays satellite and band badges', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('GOES-16')).toBeInTheDocument();
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('shows tags', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('shows primary action buttons (View, Download)', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByLabelText('View frame')).toBeInTheDocument();
    expect(screen.getByLabelText('Download frame')).toBeInTheDocument();
  });

  it('shows overflow menu button', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  it('calls onView when View clicked', () => {
    const onView = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} onView={onView} viewMode="grid" />);
    fireEvent.click(screen.getByLabelText('View frame'));
    expect(onView).toHaveBeenCalledWith(frame);
  });

  it('calls onDownload when Download clicked', () => {
    const onDownload = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} onDownload={onDownload} viewMode="grid" />);
    fireEvent.click(screen.getByLabelText('Download frame'));
    expect(onDownload).toHaveBeenCalledWith(frame);
  });

  it('overflow menu opens and shows secondary actions', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('displays file size in list mode', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="list" />);
    expect(screen.getByText(/1.*MB/i)).toBeInTheDocument();
  });

  it('all interactive elements have min 44px touch targets', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const style = btn.className;
      // Check that buttons have min-h-[44px] or min-w-[44px] class
      const hasMinSize = style.includes('min-h-[44px]') || style.includes('min-w-[44px]') || style.includes('aspect-video');
      // The thumbnail button uses aspect-video which is larger than 44px
      expect(hasMinSize || btn.getAttribute('aria-label')?.includes('GOES')).toBeTruthy();
    });
  });
});
