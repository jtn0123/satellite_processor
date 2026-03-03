/**
 * Integration test: Image selection → CompareView flow.
 *
 * Tests the full lifecycle of selecting two frames and viewing them
 * in CompareView, including mode toggling and keyboard interactions.
 * Only the HTTP layer is mocked — React components and state run for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompareView from '../../components/GoesData/CompareView';
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
    image_url: '/api/goes/frames/test/image',
    thumbnail_url: '/api/goes/frames/test/thumbnail',
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

describe('CompareView integration flow', () => {
  it('renders both frames with metadata and images in side-by-side mode', () => {
    const frameA = makeFrame({ id: 'fa', satellite: 'GOES-16', band: 'C02', capture_time: '2026-01-15T10:00:00Z' });
    const frameB = makeFrame({ id: 'fb', satellite: 'GOES-18', band: 'C13', capture_time: '2026-01-15T11:00:00Z' });
    const onClose = vi.fn();

    render(<CompareView frameA={frameA} frameB={frameB} onClose={onClose} />);

    // Dialog should be open
    const dialog = screen.getByRole('dialog', { name: /compare frames/i });
    expect(dialog).toBeInTheDocument();

    // Both satellite labels visible
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByText(/GOES-18/)).toBeInTheDocument();

    // Both band labels visible
    expect(screen.getByText(/C02/)).toBeInTheDocument();
    expect(screen.getByText(/C13/)).toBeInTheDocument();

    // Two images rendered (side-by-side default)
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThanOrEqual(2);

    // Image srcs should reference frame IDs
    const imageSrcs = images.map((img) => img.getAttribute('src'));
    expect(imageSrcs.some((src) => src?.includes('fa'))).toBe(true);
    expect(imageSrcs.some((src) => src?.includes('fb'))).toBe(true);
  });

  it('toggles between side-by-side and slider modes', async () => {
    const user = userEvent.setup();
    const frameA = makeFrame({ id: 'fa' });
    const frameB = makeFrame({ id: 'fb' });
    const onClose = vi.fn();

    render(<CompareView frameA={frameA} frameB={frameB} onClose={onClose} />);

    // Default: side-by-side is pressed
    const sideBySideBtn = screen.getByText('Side by Side');
    expect(sideBySideBtn).toHaveAttribute('aria-pressed', 'true');

    const sliderBtn = screen.getByText('Slider');
    expect(sliderBtn).toHaveAttribute('aria-pressed', 'false');

    // Switch to slider mode
    await user.click(sliderBtn);
    expect(sliderBtn).toHaveAttribute('aria-pressed', 'true');
    expect(sideBySideBtn).toHaveAttribute('aria-pressed', 'false');

    // Slider container should appear
    expect(document.querySelector('.cursor-col-resize')).toBeTruthy();

    // Switch back to side-by-side
    await user.click(sideBySideBtn);
    expect(sideBySideBtn).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.cursor-col-resize')).toBeNull();
  });

  it('closes on Escape key press', async () => {
    const user = userEvent.setup();
    const frameA = makeFrame({ id: 'fa' });
    const frameB = makeFrame({ id: 'fb' });
    const onClose = vi.fn();

    render(<CompareView frameA={frameA} frameB={frameB} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the close button', async () => {
    const user = userEvent.setup();
    const frameA = makeFrame({ id: 'fa' });
    const frameB = makeFrame({ id: 'fb' });
    const onClose = vi.fn();

    render(<CompareView frameA={frameA} frameB={frameB} onClose={onClose} />);

    await user.click(screen.getByLabelText(/close comparison view/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
