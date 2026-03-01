import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CdnImage from './CdnImage';

// Mock the liveTabUtils cache functions
vi.mock('./liveTabUtils', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./liveTabUtils');
  return {
    ...actual,
    saveCachedImage: vi.fn(),
    loadCachedImage: vi.fn(() => null),
  };
});

describe('CdnImage', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders img with correct src', () => {
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn.example.com/image.jpg');
  });

  it('shows shimmer while loading', () => {
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" />);
    expect(screen.getByTestId('image-shimmer')).toBeInTheDocument();
  });

  it('hides shimmer after load', () => {
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" />);
    fireEvent.load(screen.getByRole('img'));
    expect(screen.queryByTestId('image-shimmer')).not.toBeInTheDocument();
  });

  it('shows error state on image error when no cache available', () => {
    render(<CdnImage src="https://cdn.example.com/broken.jpg" alt="test" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('cdn-image-error')).toBeInTheDocument();
    expect(screen.getByText(/Image unavailable/)).toBeInTheDocument();
  });

  it('auto-retries with cache-buster after error', () => {
    render(<CdnImage src="https://cdn.example.com/broken.jpg" alt="test" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByTestId('cdn-image-error')).toBeInTheDocument();

    // Advance past 10s retry timer
    act(() => { vi.advanceTimersByTime(10_000); });

    // Should be back to showing the image (with cache-buster in src)
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('_r=');
  });

  it('shows error placeholder when src is empty', () => {
    render(<CdnImage src="" alt="test" />);
    expect(screen.getByTestId('cdn-image-error')).toBeInTheDocument();
  });

  it('uses h-full and object-contain when not zoomed (no fixed aspect-ratio)', () => {
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" />);
    const container = screen.getByTestId('live-image-container');
    expect(container.style.aspectRatio).toBeFalsy();
    expect(container.className).toContain('h-full');
    const img = screen.getByRole('img');
    expect(img.className).toContain('object-contain');
  });

  it('forwards imageRef to the img element', () => {
    const ref = createRef<HTMLImageElement>();
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" imageRef={ref} />);
    const img = screen.getByRole('img');
    expect(ref.current).toBe(img);
  });

  it('uses h-full and object-cover when zoomed (no fixed aspect-ratio)', () => {
    render(<CdnImage src="https://cdn.example.com/image.jpg" alt="test" isZoomed />);
    const container = screen.getByTestId('live-image-container');
    expect(container.style.aspectRatio).toBeFalsy();
    expect(container.className).toContain('h-full');
    const img = screen.getByRole('img');
    expect(img.className).toContain('object-cover');
    expect(img.className).not.toContain('object-contain');
  });
});
