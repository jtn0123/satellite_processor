import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameCard from '../components/GoesData/FrameCard';

beforeEach(() => {
  const mockObserver = vi.fn().mockImplementation((callback: IntersectionObserverCallback) => {
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
  });
  vi.stubGlobal('IntersectionObserver', mockObserver);
});

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
  it('renders in grid mode with clickable area', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThan(0);
    expect(btns.some(b => b.getAttribute('aria-label')?.includes('GOES-16'))).toBe(true);
  });

  it('renders in list mode', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="list" />);
    const btns = screen.getAllByRole('button');
    expect(btns.length).toBeGreaterThan(0);
  });

  it('calls onClick when card clicked', () => {
    const onClick = vi.fn();
    render(<FrameCard frame={frame as never} isSelected={false} onClick={onClick} viewMode="grid" />);
    const mainBtn = screen.getAllByRole('button').find(b => b.getAttribute('aria-label')?.includes('GOES-16'));
    if (mainBtn) fireEvent.click(mainBtn);
    expect(onClick).toHaveBeenCalledWith(frame, expect.any(Object));
  });

  it('shows selected indicator when isSelected', () => {
    render(<FrameCard frame={frame as never} isSelected={true} onClick={vi.fn()} viewMode="grid" />);
    expect(document.querySelector('[class*="bg-primary"]')).toBeTruthy();
  });

  it('displays capture time prominently', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });

  it('shows satellite and band as badges', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('GOES-16')).toBeInTheDocument();
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('shows tags', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('displays file size in list mode', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="list" />);
    expect(screen.getByText(/1.*MB/i)).toBeInTheDocument();
  });

  it('displays sector badge', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="grid" />);
    expect(screen.getByText('CONUS')).toBeInTheDocument();
  });

  it('shows dimensions in list mode', () => {
    render(<FrameCard frame={frame as never} isSelected={false} onClick={vi.fn()} viewMode="list" />);
    expect(screen.getByText('1920×1080')).toBeInTheDocument();
  });
});
