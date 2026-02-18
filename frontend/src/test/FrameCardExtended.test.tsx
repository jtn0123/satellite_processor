import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameCard from '../components/GoesData/FrameCard';
import type { GoesFrame } from '../components/GoesData/types';

const baseFrame: GoesFrame = {
  id: 'f1',
  satellite: 'GOES-19',
  sector: 'FullDisk',
  band: 'C02',
  capture_time: new Date().toISOString(),
  file_path: '/data/f1.nc',
  file_size: 2048000,
  width: 5424,
  height: 5424,
  thumbnail_path: '/thumbs/f1.jpg',
  tags: [{ id: 't1', name: 'Favorite', color: '#ff0000' }],
  collections: [],
};

const defaultProps = {
  frame: baseFrame,
  isSelected: false,
  onClick: vi.fn(),
  onView: vi.fn(),
  onDownload: vi.fn(),
  onCompare: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onDelete: vi.fn(),
};

describe('FrameCard — grid mode', () => {
  it('renders frame satellite and band badges', () => {
    render(<FrameCard {...defaultProps} viewMode="grid" />);
    expect(screen.getByText('GOES-19')).toBeInTheDocument();
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('renders sector and file size', () => {
    render(<FrameCard {...defaultProps} viewMode="grid" />);
    expect(screen.getByText('FullDisk')).toBeInTheDocument();
    expect(screen.getByText('2 MB')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<FrameCard {...defaultProps} viewMode="grid" />);
    expect(screen.getByText('Favorite')).toBeInTheDocument();
  });

  it('calls onClick when thumbnail clicked', () => {
    const onClick = vi.fn();
    render(<FrameCard {...defaultProps} onClick={onClick} viewMode="grid" />);
    const btn = screen.getByLabelText(/GOES-19 C02 FullDisk frame/);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith(baseFrame, expect.anything());
  });

  it('calls onView when View button clicked', () => {
    const onView = vi.fn();
    render(<FrameCard {...defaultProps} onView={onView} viewMode="grid" />);
    fireEvent.click(screen.getByLabelText('View frame'));
    expect(onView).toHaveBeenCalledWith(baseFrame);
  });

  it('calls onDownload when Download button clicked', () => {
    const onDownload = vi.fn();
    render(<FrameCard {...defaultProps} onDownload={onDownload} viewMode="grid" />);
    fireEvent.click(screen.getByLabelText('Download frame'));
    expect(onDownload).toHaveBeenCalledWith(baseFrame);
  });

  it('shows selection indicator when selected', () => {
    const { container } = render(<FrameCard {...defaultProps} isSelected={true} viewMode="grid" />);
    expect(container.querySelector('.border-primary')).toBeInTheDocument();
  });

  it('renders without thumbnail when thumbnail_path is null', () => {
    const frame = { ...baseFrame, thumbnail_path: null };
    render(<FrameCard {...defaultProps} frame={frame} viewMode="grid" />);
    // Should still render without error
    expect(screen.getByText('GOES-19')).toBeInTheDocument();
  });
});

describe('FrameCard — list mode', () => {
  it('renders in list layout', () => {
    render(<FrameCard {...defaultProps} viewMode="list" />);
    expect(screen.getByText('GOES-19')).toBeInTheDocument();
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('calls onClick in list mode', () => {
    const onClick = vi.fn();
    render(<FrameCard {...defaultProps} onClick={onClick} viewMode="list" />);
    const btn = screen.getByLabelText(/GOES-19 C02 FullDisk frame/);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('has View and Download buttons in list mode', () => {
    render(<FrameCard {...defaultProps} viewMode="list" />);
    expect(screen.getByLabelText('View frame')).toBeInTheDocument();
    expect(screen.getByLabelText('Download frame')).toBeInTheDocument();
  });

  it('shows selection styling when selected in list mode', () => {
    const { container } = render(<FrameCard {...defaultProps} isSelected={true} viewMode="list" />);
    expect(container.querySelector('.border-primary\\/30')).toBeTruthy();
  });
});
