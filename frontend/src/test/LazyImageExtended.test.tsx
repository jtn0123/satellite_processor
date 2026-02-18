import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import LazyImage from '../components/GoesData/LazyImage';

type IOCallback = IntersectionObserverCallback;

function setupIO() {
  let storedCb: IOCallback | null = null;
  const instances: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

  class MockIO {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(cb: IOCallback) {
      storedCb = cb;
      instances.push(this);
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIO);

  function trigger() {
    const inst = instances[instances.length - 1];
    if (storedCb && inst) {
      act(() => {
        storedCb!([{ isIntersecting: true } as IntersectionObserverEntry], inst as unknown as IntersectionObserver);
      });
    }
  }

  function triggerNotIntersecting() {
    const inst = instances[instances.length - 1];
    if (storedCb && inst) {
      act(() => {
        storedCb!([{ isIntersecting: false } as IntersectionObserverEntry], inst as unknown as IntersectionObserver);
      });
    }
  }

  return { trigger, triggerNotIntersecting, instances };
}

describe('LazyImage — extended', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('does not render img before intersection', () => {
    setupIO();
    render(<LazyImage src="/img.jpg" alt="satellite" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders img after intersection', () => {
    const io = setupIO();
    render(<LazyImage src="/img.jpg" alt="satellite" />);
    io.trigger();
    expect(screen.getByRole('img')).toHaveAttribute('src', '/img.jpg');
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'satellite');
  });

  it('img starts with opacity-0 and transitions to opacity-100 on load', () => {
    const io = setupIO();
    render(<LazyImage src="/img.jpg" alt="test" />);
    io.trigger();
    const img = screen.getByRole('img');
    expect(img.className).toContain('opacity-0');
    fireEvent.load(img);
    expect(img.className).toContain('opacity-100');
  });

  it('uses default placeholder when none provided', () => {
    setupIO();
    render(<LazyImage src="/img.jpg" alt="test" />);
    const wrapper = screen.getByTestId('lazy-image-wrapper');
    expect(wrapper.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders custom placeholder', () => {
    setupIO();
    render(<LazyImage src="/img.jpg" alt="test" placeholder={<div data-testid="custom">Loading</div>} />);
    expect(screen.getByTestId('custom')).toBeInTheDocument();
  });

  it('does not show image when not intersecting', () => {
    const io = setupIO();
    render(<LazyImage src="/img.jpg" alt="test" />);
    io.triggerNotIntersecting();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('disconnects observer after becoming visible', () => {
    const io = setupIO();
    render(<LazyImage src="/img.jpg" alt="test" />);
    io.trigger();
    expect(io.instances[0].disconnect).toHaveBeenCalled();
  });

  it('applies className to wrapper', () => {
    setupIO();
    render(<LazyImage src="/img.jpg" alt="test" className="custom-class" />);
    expect(screen.getByTestId('lazy-image-wrapper')).toHaveClass('custom-class');
  });

  it('img has lazy loading and async decoding attributes', () => {
    const io = setupIO();
    render(<LazyImage src="/img.jpg" alt="test" />);
    io.trigger();
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });
});
