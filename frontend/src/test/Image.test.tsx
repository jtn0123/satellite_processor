import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Image from '../components/Image';

// JTN-394: the Image wrapper is a default-lazy drop-in replacement for
// raw <img>. These tests lock in the defaults, the override path, and
// the forwarded-ref escape hatch.

describe('Image wrapper (JTN-394)', () => {
  it('applies lazy / async / non-draggable defaults', () => {
    render(<Image src="/x.png" alt="x" />);
    const img = screen.getByAltText('x') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    // draggable is reflected as the string "false" in the DOM
    expect(img.getAttribute('draggable')).toBe('false');
    expect(img.src).toContain('/x.png');
  });

  it('caller can opt into eager loading for above-the-fold surfaces', () => {
    render(<Image src="/hero.png" alt="Hero" loading="eager" />);
    const img = screen.getByAltText('Hero') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBe('eager');
  });

  it('forwards arbitrary props and className to the underlying img', () => {
    render(<Image src="/y.png" alt="y" className="rounded-lg" data-testid="forwarded" />);
    const img = screen.getByTestId('forwarded') as HTMLImageElement;
    expect(img.className).toBe('rounded-lg');
    expect(img.getAttribute('alt')).toBe('y');
  });

  it('accepts an empty alt for purely decorative images', () => {
    render(<Image src="/deco.png" alt="" data-testid="deco" />);
    const img = screen.getByTestId('deco') as HTMLImageElement;
    expect(img.getAttribute('alt')).toBe('');
  });

  it('forwards a ref via imageRef so consumers can do imperative zoom/pan', () => {
    const ref: { current: HTMLImageElement | null } = { current: null };
    render(<Image src="/z.png" alt="ref" imageRef={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.getAttribute('alt')).toBe('ref');
  });
});
