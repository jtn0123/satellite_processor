/**
 * Integration test: ImageViewer keyboard navigation and zoom flow.
 *
 * No mocking needed — ImageViewer is a pure presentational component that
 * accepts props. We test the real component with real hooks (useImageZoom)
 * to verify keyboard navigation, zoom controls, and metadata display.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImageViewer from '../../components/GoesData/ImageViewer';
import type { GoesFrame } from '../../components/GoesData/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeFrame(overrides: Partial<GoesFrame> = {}): GoesFrame {
  return {
    id: crypto.randomUUID(),
    satellite: 'GOES-16',
    sector: 'CONUS',
    band: 'C02',
    capture_time: '2026-01-15T12:00:00Z',
    image_url: '/api/satellite/frames/test/image',
    thumbnail_url: '/api/satellite/frames/test/thumbnail',
    file_size: 1024,
    width: 500,
    height: 500,
    tags: [],
    collections: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImageViewer navigation integration', () => {
  it('displays frame metadata and position indicator', () => {
    const frames = [
      makeFrame({ id: 'f1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS' }),
      makeFrame({ id: 'f2', satellite: 'GOES-18', band: 'C13', sector: 'FD' }),
      makeFrame({ id: 'f3', satellite: 'GOES-16', band: 'C02', sector: 'MESO1' }),
    ];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ImageViewer frame={frames[1]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    // Dialog should be open
    expect(screen.getByRole('dialog', { name: /image viewer/i })).toBeInTheDocument();

    // Current frame metadata
    expect(screen.getByText('GOES-18')).toBeInTheDocument();
    expect(screen.getByText(/C13/)).toBeInTheDocument();
    expect(screen.getByText(/FD/)).toBeInTheDocument();

    // Position indicator
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('navigates to next frame on ArrowRight key', async () => {
    const user = userEvent.setup();
    const frames = [
      makeFrame({ id: 'f1' }),
      makeFrame({ id: 'f2' }),
      makeFrame({ id: 'f3' }),
    ];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.keyboard('{ArrowRight}');
    expect(onNavigate).toHaveBeenCalledWith(frames[1]);
  });

  it('navigates to previous frame on ArrowLeft key', async () => {
    const user = userEvent.setup();
    const frames = [
      makeFrame({ id: 'f1' }),
      makeFrame({ id: 'f2' }),
      makeFrame({ id: 'f3' }),
    ];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ImageViewer frame={frames[2]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.keyboard('{ArrowLeft}');
    expect(onNavigate).toHaveBeenCalledWith(frames[1]);
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ id: 'f1' })];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('zoom controls update the displayed zoom percentage', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ id: 'f1' })];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    // Initial zoom should be 100%
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Click zoom in
    await user.click(screen.getByLabelText('Zoom in'));
    await waitFor(() => {
      expect(screen.getByText('150%')).toBeInTheDocument();
    });

    // Click zoom out
    await user.click(screen.getByLabelText('Zoom out'));
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    // Click reset
    await user.click(screen.getByLabelText('Zoom in'));
    await user.click(screen.getByLabelText('Zoom in'));
    await user.click(screen.getByLabelText('Reset zoom'));
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  it('does not navigate past the first or last frame', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ id: 'f1' }), makeFrame({ id: 'f2' })];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    // At first frame, ArrowLeft should not navigate
    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={onClose} onNavigate={onNavigate} />,
    );

    await user.keyboard('{ArrowLeft}');
    expect(onNavigate).not.toHaveBeenCalled();

    // ArrowRight should navigate to next
    await user.keyboard('{ArrowRight}');
    expect(onNavigate).toHaveBeenCalledWith(frames[1]);
  });
});
