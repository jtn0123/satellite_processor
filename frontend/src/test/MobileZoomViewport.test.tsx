import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CdnImage from '../components/GoesData/CdnImage';

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('CdnImage — no fixed aspect-ratio when unzoomed', () => {
  it('does not apply inline aspect-ratio style when unzoomed', () => {
    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CdnImage src="https://example.com/img.jpg" alt="test" />
      </QueryClientProvider>,
    );
    const container = screen.getByTestId('live-image-container');
    expect(container.style.aspectRatio).toBeFalsy();
  });

  it('does not apply inline aspect-ratio style when zoomed', () => {
    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CdnImage src="https://example.com/img.jpg" alt="test" isZoomed />
      </QueryClientProvider>,
    );
    const container = screen.getByTestId('live-image-container');
    expect(container.style.aspectRatio).toBeFalsy();
  });

  it('container has h-full class', () => {
    const qc = makeQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <CdnImage src="https://example.com/img.jpg" alt="test" />
      </QueryClientProvider>,
    );
    const container = screen.getByTestId('live-image-container');
    expect(container.className).toContain('h-full');
  });
});

/** Reproduces the useZoomHint hook from LiveTab */
function useZoomHint(isZoomed: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasZoomedRef = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync hint visibility with zoom state */
  useEffect(() => {
    if (isZoomed && !wasZoomedRef.current) {
      setVisible(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), 2000);
    }
    if (!isZoomed) {
      setVisible(false);
      clearTimeout(timerRef.current);
    }
    wasZoomedRef.current = isZoomed;
    return () => clearTimeout(timerRef.current);
  }, [isZoomed]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return visible;
}

describe('Zoom hint timing', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('useZoomHint shows hint on zoom-in and hides after 2s', () => {
    const { result, rerender } = renderHook(({ zoomed }) => useZoomHint(zoomed), {
      initialProps: { zoomed: false },
    });

    expect(result.current).toBe(false);

    // Zoom in
    rerender({ zoomed: true });
    expect(result.current).toBe(true);

    // After 2s it should hide
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current).toBe(false);
  });
});
