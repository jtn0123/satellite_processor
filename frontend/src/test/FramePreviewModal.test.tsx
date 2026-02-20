import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FramePreviewModal from '../components/GoesData/FramePreviewModal';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: { id: 'cp1' } })),
  },
}));

vi.mock('../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

const frame = {
  id: 'f1',
  satellite: 'GOES-16',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z',
  file_path: '/path/to/file.nc',
  thumbnail_path: '/path/to/thumb.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
  file_size: 2048000,
  width: 1920,
  height: 1080,
  tags: [],
  collections: [],
};

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FramePreviewModal', () => {
  it('renders dialog', () => {
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows frame info', () => {
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={vi.fn()} />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByText(/C02/)).toBeInTheDocument();
  });

  it('calls onClose on close button click', () => {
    const onClose = vi.fn();
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close preview'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on overlay click', () => {
    const onClose = vi.fn();
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders image element', () => {
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={vi.fn()} />);
    const img = screen.getByAltText('GOES-16 C02');
    expect(img).toBeInTheDocument();
  });

  it('responds to close-modal event', () => {
    const onClose = vi.fn();
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={onClose} />);
    globalThis.dispatchEvent(new CustomEvent('close-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('handles mouse interactions for crop', () => {
    renderWithQuery(<FramePreviewModal frame={frame as never} onClose={vi.fn()} />);
    const container = document.querySelector('.cursor-crosshair');
    expect(container).toBeInTheDocument();
    if (container) {
      fireEvent.mouseDown(container, { clientX: 100, clientY: 100 });
      fireEvent.mouseMove(container, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(container);
    }
  });

  it('navigates with arrow keys when allFrames provided', () => {
    const frame2 = { ...frame, id: 'f2' };
    const onNavigate = vi.fn();
    renderWithQuery(
      <FramePreviewModal frame={frame as never} onClose={vi.fn()} allFrames={[frame, frame2] as never[]} onNavigate={onNavigate} />
    );
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(onNavigate).toHaveBeenCalledWith(frame2);
  });

  it('navigates left with arrow keys', () => {
    const frame2 = { ...frame, id: 'f2' };
    const onNavigate = vi.fn();
    renderWithQuery(
      <FramePreviewModal frame={frame2 as never} onClose={vi.fn()} allFrames={[frame, frame2] as never[]} onNavigate={onNavigate} />
    );
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(onNavigate).toHaveBeenCalledWith(frame);
  });
});
