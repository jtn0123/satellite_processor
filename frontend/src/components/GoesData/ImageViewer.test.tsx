import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImageViewer from './ImageViewer';
import type { GoesFrame } from './types';

function makeFrame(id: string): GoesFrame {
  return {
    id,
    satellite: 'GOES-18',
    sector: 'CONUS',
    band: '02',
    capture_time: '2024-01-01T00:00:00Z',
    image_url: `/api/goes/frames/${id}/image`,
    thumbnail_url: null,
    file_size: 1000,
    width: 1000,
    height: 600,
    tags: [],
    collections: [],
  };
}

describe('ImageViewer', () => {
  const frames = [makeFrame('1'), makeFrame('2'), makeFrame('3')];

  it('renders with correct image and metadata', () => {
    render(
      <ImageViewer frame={frames[1]} frames={frames} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    expect(screen.getByAltText(/GOES-18/)).toBeInTheDocument();
    expect(screen.getByText('GOES-18')).toBeInTheDocument();
    expect(screen.getByText('Band 02')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('applies useImageZoom style with correct transform order (translate before scale)', () => {
    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    const img = screen.getByAltText(/GOES-18/) as HTMLImageElement;
    // Initial state: translate(0px, 0px) scale(1)
    expect(img.style.transform).toMatch(/translate\(0px, 0px\) scale\(1\)/);
  });

  it('does NOT use the buggy translate(x/scale) pattern', () => {
    render(
      <ImageViewer frame={frames[0]} frames={frames} onClose={vi.fn()} onNavigate={vi.fn()} />,
    );
    const img = screen.getByAltText(/GOES-18/) as HTMLImageElement;
    // The old code used: scale(S) translate(x/S, y/S) — wrong order and division
    // New code uses: translate(Xpx, Ypx) scale(S) — correct
    expect(img.style.transform).not.toMatch(/scale\([^)]+\)\s*translate/);
  });
});
