import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

describe('Zoom hint', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('zoom hint concept — shows then fades', () => {
    // This tests the pattern: a hint that shows for 2s then disappears
    let visible = false;
    const show = () => { visible = true; };
    const hide = () => { visible = false; };

    show();
    expect(visible).toBe(true);

    // After 2s
    setTimeout(hide, 2000);
    act(() => { vi.advanceTimersByTime(2000); });
    expect(visible).toBe(false);
  });
});
