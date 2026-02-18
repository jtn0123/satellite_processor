import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LazyImage from '../components/GoesData/LazyImage';

// The setup.ts stubs IntersectionObserver globally. We override it per-test.
let observerCallback: IntersectionObserverCallback;
let observerInstance: ReturnType<typeof createMockObserver>;

function createMockObserver() {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => [] as IntersectionObserverEntry[]),
  };
}

beforeEach(() => {
  observerInstance = createMockObserver();
  // Override the global stub from setup.ts — must be callable with `new`
  function MockIO(this: Record<string, unknown>, cb: IntersectionObserverCallback) {
    observerCallback = cb;
    Object.assign(this, observerInstance);
  }
  globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
});

function triggerIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver
    );
  });
}

describe('LazyImage', () => {
  it('renders wrapper with data-testid', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    expect(screen.getByTestId('lazy-image-wrapper')).toBeInTheDocument();
  });

  it('shows default placeholder before intersection', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('lazy-image-wrapper').querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows custom placeholder before intersection', () => {
    render(<LazyImage src="/img.png" alt="test" placeholder={<span data-testid="custom-ph">Loading...</span>} />);
    expect(screen.getByTestId('custom-ph')).toBeInTheDocument();
  });

  it('renders img after intersection is triggered', () => {
    render(<LazyImage src="/img.png" alt="test image" />);
    triggerIntersection(true);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/img.png');
    expect(img).toHaveAttribute('alt', 'test image');
  });

  it('applies opacity-0 before load, opacity-100 after onLoad', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    triggerIntersection(true);
    const img = screen.getByRole('img');
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('disconnects observer after becoming visible', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    triggerIntersection(true);
    expect(observerInstance.disconnect).toHaveBeenCalled();
  });

  it('does not render img if not intersecting', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    triggerIntersection(false);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('applies custom className to wrapper', () => {
    render(<LazyImage src="/img.png" alt="test" className="my-class" />);
    expect(screen.getByTestId('lazy-image-wrapper')).toHaveClass('my-class');
  });

  it('sets loading=lazy and decoding=async on img', () => {
    render(<LazyImage src="/img.png" alt="test" />);
    triggerIntersection(true);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });
});
