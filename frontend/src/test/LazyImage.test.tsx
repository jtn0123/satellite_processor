import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import LazyImage from '../components/GoesData/LazyImage';

describe('LazyImage', () => {
  it('shows skeleton placeholder initially (not in viewport)', () => {
    const { container } = render(<LazyImage src="/test.jpg" alt="test" />);
    // Skeleton should show (global mock never triggers callback)
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
    // No img rendered yet
    expect(container.querySelector('img')).toBeNull();
  });

  it('loads image when intersection triggers', async () => {
    // Override the global mock to capture and trigger callback
    let capturedCb: IntersectionObserverCallback | undefined;
    const OrigMock = globalThis.IntersectionObserver;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { capturedCb = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    });

    const { container } = render(<LazyImage src="/test.jpg" alt="test image" />);

    // Trigger intersection
    act(() => {
      capturedCb?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img!.getAttribute('src')).toBe('/test.jpg');

    // Restore
    vi.stubGlobal('IntersectionObserver', OrigMock);
  });

  it('removes skeleton after image loads', () => {
    let capturedCb: IntersectionObserverCallback | undefined;
    const OrigMock = globalThis.IntersectionObserver;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { capturedCb = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    });

    const { container } = render(<LazyImage src="/test.jpg" alt="test" />);
    act(() => {
      capturedCb?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    fireEvent.load(container.querySelector('img')!);
    expect(container.querySelector('.animate-pulse')).toBeNull();

    vi.stubGlobal('IntersectionObserver', OrigMock);
  });
});
