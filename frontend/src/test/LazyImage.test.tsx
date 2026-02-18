import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import LazyImage from '../components/GoesData/LazyImage';

function mockIO(triggerImmediately = false) {
  const disconnect = vi.fn();
  const observe = vi.fn();
  let storedCb: IntersectionObserverCallback | null = null;
  const instances: MockIO[] = [];

  class MockIO {
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    constructor(cb: IntersectionObserverCallback) {
      storedCb = cb;
      instances.push(this);
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIO);

  function trigger() {
    const instance = instances[instances.length - 1] ?? null;
    if (storedCb && instance) {
      act(() => {
        storedCb!([{ isIntersecting: true } as IntersectionObserverEntry], instance as unknown as IntersectionObserver);
      });
    }
  }

  return { disconnect, observe, trigger, shouldTrigger: triggerImmediately };
}

describe('LazyImage', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows placeholder when not yet visible', () => {
    mockIO(false);
    render(<LazyImage src="/test.jpg" alt="test" className="w-full" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByTestId('lazy-image-wrapper')).toBeInTheDocument();
  });

  it('loads image when intersection observer triggers', () => {
    const io = mockIO();
    render(<LazyImage src="/test.jpg" alt="test image" className="w-full" />);
    io.trigger();
    expect(screen.getByRole('img')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/test.jpg');
  });

  it('renders custom placeholder', () => {
    mockIO(false);
    render(<LazyImage src="/test.jpg" alt="test" className="w-full" placeholder={<span data-testid="custom-ph">Loading</span>} />);
    expect(screen.getByTestId('custom-ph')).toBeInTheDocument();
  });

  it('disconnects observer on unmount', () => {
    const { disconnect } = mockIO(false);
    const { unmount } = render(<LazyImage src="/test.jpg" alt="test" className="w-full" />);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
