/**
 * Tests for the zoom edge-pan bug and related UX polish.
 *
 * Bug: CdnImage switches to `object-cover` when zoomed, which CROPS the image
 * to fill the container. CSS transform then operates on the cropped result,
 * making edges permanently unreachable. The fix: always use `object-contain`
 * and add a cover-scale minimum so low zoom levels still fill the container.
 *
 * These tests are written RED-GREEN: they FAIL on the buggy code and PASS
 * after the fix is applied.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { clampTranslate, useImageZoom } from '../hooks/useImageZoom';
import CdnImage from '../components/GoesData/CdnImage';
import type { RefObject } from 'react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainerRef(width: number, height: number): RefObject<HTMLElement> {
  return {
    current: {
      getBoundingClientRect: () => ({
        width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}),
      }),
    } as unknown as HTMLElement,
  };
}

function makeImageRef(naturalWidth: number, naturalHeight: number): RefObject<HTMLImageElement> {
  return {
    current: {
      naturalWidth,
      naturalHeight,
    } as unknown as HTMLImageElement,
  };
}

function makeWheelEvent(deltaY: number, clientX = 0, clientY = 0) {
  return { deltaY, clientX, clientY, preventDefault: () => {} } as unknown as React.WheelEvent;
}

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>) {
  return { touches, preventDefault: () => {} } as unknown as React.TouchEvent;
}

function parseTransform(transform: string) {
  const txMatch = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  const scaleMatch = transform.match(/scale\(([-\d.]+)\)/);
  return {
    tx: txMatch ? Number(txMatch[1]) : 0,
    ty: txMatch ? Number(txMatch[2]) : 0,
    scale: scaleMatch ? Number(scaleMatch[1]) : 1,
  };
}

/**
 * For an object-contain image, compute the rendered dimensions within a container.
 */
function objectContainDims(containerW: number, containerH: number, imageAspect: number) {
  const renderedW = Math.min(containerW, containerH * imageAspect);
  const renderedH = Math.min(containerH, containerW / imageAspect);
  return { renderedW, renderedH };
}

/**
 * Compute the cover scale: minimum scale at which object-contain fills the container.
 */
function coverScale(containerW: number, containerH: number, imageAspect: number) {
  const { renderedW, renderedH } = objectContainDims(containerW, containerH, imageAspect);
  return Math.max(containerW / renderedW, containerH / renderedH);
}

// ===========================================================================
// 1. CdnImage CSS class tests — object-contain vs object-cover
// ===========================================================================

describe('CdnImage: always uses object-contain (never object-cover)', () => {
  it('renders object-contain class on img element', () => {
    const { container } = render(
      <CdnImage src="https://example.com/test.png" alt="test" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.className).toContain('object-contain');
  });

  it('does NOT apply object-cover class', () => {
    const { container } = render(
      <CdnImage src="https://example.com/test.png" alt="test" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.className).not.toContain('object-cover');
  });

  it('object-contain is unconditional', () => {
    const { container } = render(
      <CdnImage src="https://example.com/test.png" alt="test" />,
    );
    const img = container.querySelector('img');
    expect(img!.className).toContain('object-contain');
    expect(img!.className).not.toContain('object-cover');
  });
});

// ===========================================================================
// 2. Full-edge pan reachability via clampTranslate
// ===========================================================================

describe('clampTranslate: full-edge pan reachability', () => {
  // For each scenario, verify that the clamp allows panning far enough
  // to see every edge of the image (under object-contain layout).

  it('wide image (16:9) in square container at scale 3 — can reach right edge', () => {
    const containerW = 800, containerH = 800, aspect = 16 / 9, scale = 3;
    const { renderedW } = objectContainDims(containerW, containerH, aspect);
    // renderedW = min(800, 800 * 16/9) = min(800, 1422) = 800
    // maxX = (800 * 3 - 800) / 2 = 800
    const expectedMaxX = (renderedW * scale - containerW) / 2;
    const result = clampTranslate(9999, 0, scale, containerW, containerH, aspect);
    expect(result.tx).toBe(expectedMaxX);
    expect(result.tx).toBeGreaterThan(0);
  });

  it('wide image (16:9) in square container at scale 3 — can reach left edge', () => {
    const containerW = 800, containerH = 800, aspect = 16 / 9, scale = 3;
    const { renderedW } = objectContainDims(containerW, containerH, aspect);
    const expectedMinX = -(renderedW * scale - containerW) / 2;
    const result = clampTranslate(-9999, 0, scale, containerW, containerH, aspect);
    expect(result.tx).toBe(expectedMinX);
    expect(result.tx).toBeLessThan(0);
  });

  it('tall image (3:5) in wide container at scale 2 — can reach bottom edge', () => {
    const containerW = 1200, containerH = 600, aspect = 3 / 5, scale = 2;
    const { renderedH } = objectContainDims(containerW, containerH, aspect);
    // renderedH = min(600, 1200 / (3/5)) = min(600, 2000) = 600
    const expectedMaxY = (renderedH * scale - containerH) / 2;
    const result = clampTranslate(0, 9999, scale, containerW, containerH, aspect);
    expect(result.ty).toBe(expectedMaxY);
  });

  it('tall image (3:5) in wide container at scale 2 — can reach top edge', () => {
    const containerW = 1200, containerH = 600, aspect = 3 / 5, scale = 2;
    const { renderedH } = objectContainDims(containerW, containerH, aspect);
    const expectedMinY = -(renderedH * scale - containerH) / 2;
    const result = clampTranslate(0, -9999, scale, containerW, containerH, aspect);
    expect(result.ty).toBe(expectedMinY);
  });

  it('pan range is symmetric for all axis', () => {
    const configs = [
      { cw: 800, ch: 800, aspect: 16 / 9, scale: 3 },
      { cw: 1200, ch: 600, aspect: 3 / 5, scale: 2 },
      { cw: 400, ch: 300, aspect: 5 / 3, scale: 2.5 },
      { cw: 1920, ch: 1080, aspect: 4 / 3, scale: 5 },
      { cw: 600, ch: 600, aspect: 1, scale: 2 },
    ];
    for (const { cw, ch, aspect, scale } of configs) {
      const maxResult = clampTranslate(9999, 9999, scale, cw, ch, aspect);
      const minResult = clampTranslate(-9999, -9999, scale, cw, ch, aspect);
      expect(maxResult.tx).toBe(-minResult.tx);
      expect(maxResult.ty).toBe(-minResult.ty);
    }
  });

  it.each([
    { aspect: 2 / 1, label: '2:1' },
    { aspect: 16 / 9, label: '16:9' },
    { aspect: 4 / 3, label: '4:3' },
    { aspect: 1, label: '1:1' },
    { aspect: 3 / 4, label: '3:4' },
  ])('asymmetric aspect $label at scale 2 in 800x600 container — full edge access', ({ aspect }) => {
    const cw = 800, ch = 600, scale = 2;
    const { renderedW, renderedH } = objectContainDims(cw, ch, aspect);
    const expectedMaxX = Math.max(0, (renderedW * scale - cw) / 2);
    const expectedMaxY = Math.max(0, (renderedH * scale - ch) / 2);

    const maxResult = clampTranslate(9999, 9999, scale, cw, ch, aspect);
    expect(maxResult.tx).toBe(expectedMaxX);
    expect(maxResult.ty).toBe(expectedMaxY);
  });

  it.each([
    { aspect: 2 / 1, label: '2:1' },
    { aspect: 16 / 9, label: '16:9' },
    { aspect: 5 / 3, label: '5:3' },
  ])('$label image at scale 5 in 1920x1080 container — large pan range', ({ aspect }) => {
    const cw = 1920, ch = 1080, scale = 5;
    const { renderedW, renderedH } = objectContainDims(cw, ch, aspect);
    const expectedMaxX = Math.max(0, (renderedW * scale - cw) / 2);
    const expectedMaxY = Math.max(0, (renderedH * scale - ch) / 2);

    const maxResult = clampTranslate(99999, 99999, scale, cw, ch, aspect);
    expect(maxResult.tx).toBe(expectedMaxX);
    expect(maxResult.ty).toBe(expectedMaxY);
    // At scale 5 the pan range must be substantial
    expect(expectedMaxX).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 3. Cover-scale / eliminateLetterbox option
// ===========================================================================

describe('useImageZoom: eliminateLetterbox cover-scale', () => {
  it('at scale just above 1, effective scale eliminates letterbox bars', () => {
    // 5:3 image in 800x800 container
    // object-contain: renderedW = 800, renderedH = 480
    // coverScale = max(800/800, 800/480) = max(1, 1.667) = 1.667
    const containerRef = makeContainerRef(800, 800);
    const imageRef = makeImageRef(5000, 3000); // 5:3
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef, eliminateLetterbox: true }),
    );

    // Zoom in slightly (scale ~1.15 via one wheel tick)
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);

    // The effective (visual) scale should be at least the cover scale
    const transform = result.current.style.transform as string;
    const { scale: visualScale } = parseTransform(transform);
    const expectedCoverScale = coverScale(800, 800, 5 / 3);
    expect(visualScale).toBeGreaterThanOrEqual(expectedCoverScale - 0.01);
  });

  it('at scale above cover scale, user scale is used directly', () => {
    const containerRef = makeContainerRef(800, 800);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef, eliminateLetterbox: true }),
    );

    // Zoom in a lot
    for (let i = 0; i < 20; i++) {
      act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    }

    const transform = result.current.style.transform as string;
    const { scale: visualScale } = parseTransform(transform);
    // Should be well above cover scale (1.667), user's chosen scale dominates
    expect(visualScale).toBeGreaterThan(2);
  });

  it('cover scale = 1 when image matches container aspect', () => {
    // 4:3 image in 800x600 container (same aspect)
    const containerRef = makeContainerRef(800, 600);
    const imageRef = makeImageRef(4000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef, eliminateLetterbox: true }),
    );

    // One zoom tick
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    const transform = result.current.style.transform as string;
    const { scale: visualScale } = parseTransform(transform);
    // Cover scale is 1.0, so the visual scale should be the user's actual scale
    // (just slightly above 1 from one wheel tick)
    expect(visualScale).toBeGreaterThan(1);
    expect(visualScale).toBeLessThan(1.5);
  });

  it('eliminateLetterbox=false (default) does NOT apply cover scale', () => {
    // Same 5:3 in 800x800, but without eliminateLetterbox
    const containerRef = makeContainerRef(800, 800);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef }),
    );

    // One zoom tick (scale ~1.15)
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    const transform = result.current.style.transform as string;
    const { scale: visualScale } = parseTransform(transform);

    // Should be the raw scale (~1.15), NOT the cover scale (1.667)
    expect(visualScale).toBeLessThan(1.5);
  });

  it('clamp bounds use effective scale when eliminateLetterbox is on', () => {
    // 5:3 image in 800x800. At user scale 1.1, effective scale = coverScale ≈ 1.667
    // Pan bounds at effective scale should be larger than at raw scale
    const containerRef = makeContainerRef(800, 800);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef, eliminateLetterbox: true }),
    );

    // Zoom in once then pan hard right
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    act(() => result.current.handlers.onMouseDown({ clientX: 400, clientY: 400 } as React.MouseEvent));
    act(() => result.current.handlers.onMouseMove({ clientX: 9999, clientY: 400 } as React.MouseEvent));

    const transform = result.current.style.transform as string;
    const { tx, scale: visualScale } = parseTransform(transform);

    // At effective scale ~1.667, maxX = (800 * 1.667 - 800) / 2 ≈ 267
    // Should be clamped but to the effective scale's bounds, not the raw scale's bounds
    const { renderedW } = objectContainDims(800, 800, 5 / 3);
    const expectedMaxX = (renderedW * visualScale - 800) / 2;
    expect(tx).toBeCloseTo(expectedMaxX, 0);
    expect(tx).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 4. Zoom toward cursor (focal-point zoom)
// ===========================================================================

describe('useImageZoom: zoom toward cursor', () => {
  it('wheel zoom at right edge of container shifts translate left', () => {
    const containerRef = makeContainerRef(800, 600);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef }),
    );

    // Zoom in with cursor at right edge (800, 300)
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 800, 300)));
    // Zoom more
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 800, 300)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 800, 300)));

    const { tx } = parseTransform(result.current.style.transform as string);
    // When zooming at the right edge, the viewport should shift left (negative tx)
    // to keep the right edge area under the cursor
    expect(tx).toBeLessThan(0);
  });

  it('wheel zoom at left edge of container shifts translate right', () => {
    const containerRef = makeContainerRef(800, 600);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef }),
    );

    // Zoom in with cursor at left edge (0, 300)
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 0, 300)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 0, 300)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 0, 300)));

    const { tx } = parseTransform(result.current.style.transform as string);
    // When zooming at the left edge, the viewport should shift right (positive tx)
    expect(tx).toBeGreaterThan(0);
  });

  it('wheel zoom at center keeps translate near zero', () => {
    const containerRef = makeContainerRef(800, 600);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef }),
    );

    // Zoom in at center (400, 300)
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 400, 300)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100, 400, 300)));

    const { tx, ty } = parseTransform(result.current.style.transform as string);
    // Zooming at center should not shift significantly
    expect(Math.abs(tx)).toBeLessThan(5);
    expect(Math.abs(ty)).toBeLessThan(5);
  });

  it('pinch zoom at off-center point preserves focal point', () => {
    const containerRef = makeContainerRef(800, 600);
    const imageRef = makeImageRef(5000, 3000);
    const { result } = renderHook(() =>
      useImageZoom({ containerRef, imageRef }),
    );

    // Start pinch at offset position (midpoint ~150, 100)
    const startTouches = [
      { clientX: 100, clientY: 50 },
      { clientX: 200, clientY: 150 },
    ];
    act(() => result.current.handlers.onTouchStart(makeTouchEvent(startTouches)));

    // Spread fingers apart (zoom in), midpoint stays ~150, 100
    const moveTouches = [
      { clientX: 50, clientY: 0 },
      { clientX: 250, clientY: 200 },
    ];
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(moveTouches)));

    const { tx, ty } = parseTransform(result.current.style.transform as string);
    // Pinch at top-left area should shift viewport toward top-left (positive tx, positive ty)
    // since we're zooming into an area above and left of center
    expect(tx).toBeGreaterThan(0);
    expect(ty).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 5. Edge reachability regression
// ===========================================================================

describe('edge reachability regression', () => {
  it('bug regression: object-cover crops edges making them unreachable', () => {
    // With object-contain: a 2:1 image in a 400x300 container
    // renderedW = min(400, 300*2) = 400, renderedH = min(300, 400/2) = 200
    // Image is 400x200 centered in 400x300 (50px letterbox top/bottom)
    //
    // At scale 3 with object-contain:
    //   maxX = (400*3 - 400)/2 = 400 → can pan 400px right to see right edge
    //   maxY = (200*3 - 300)/2 = 150 → can pan 150px down to see bottom edge
    //
    // With object-cover (THE BUG):
    //   The image fills 400x300 (scaled to 600x300, cropping 100px each side horizontally)
    //   At scale 3, CSS transform scales the CROPPED image, so the
    //   left/right 100px of the source image remain permanently hidden.
    //
    // This test verifies the clamp math is correct for object-contain
    // (which is what the code should use).
    const aspect = 2 / 1;
    const cw = 400, ch = 300, scale = 3;
    const maxResult = clampTranslate(9999, 9999, scale, cw, ch, aspect);
    const minResult = clampTranslate(-9999, -9999, scale, cw, ch, aspect);

    // Full horizontal range
    expect(maxResult.tx).toBe(400);
    expect(minResult.tx).toBe(-400);

    // Full vertical range
    expect(maxResult.ty).toBe(150);
    expect(minResult.ty).toBe(-150);
  });

  it('GOES CONUS typical dimensions — all edges reachable at scale 3', () => {
    // Typical CONUS image: ~5424x3000 (aspect ≈ 1.808)
    // Typical container: 1200x700
    const aspect = 5424 / 3000; // ~1.808
    const cw = 1200, ch = 700, scale = 3;
    const { renderedW, renderedH } = objectContainDims(cw, ch, aspect);
    // renderedW = min(1200, 700*1.808) = min(1200, 1265.6) = 1200
    // renderedH = min(700, 1200/1.808) = min(700, 663.7) = 663.7

    const maxX = (renderedW * scale - cw) / 2; // (3600 - 1200) / 2 = 1200
    const maxY = (renderedH * scale - ch) / 2; // (1991 - 700) / 2 = 645.5

    const maxResult = clampTranslate(9999, 9999, scale, cw, ch, aspect);
    expect(maxResult.tx).toBeCloseTo(maxX, 0);
    expect(maxResult.ty).toBeCloseTo(maxY, 0);
    expect(maxResult.tx).toBeGreaterThan(0);
    expect(maxResult.ty).toBeGreaterThan(0);
  });

  it('Full Disk image — all edges reachable at scale 5', () => {
    // Full Disk: roughly square (5424x5424, aspect = 1)
    // Container: 1920x1080
    const aspect = 1;
    const cw = 1920, ch = 1080, scale = 5;
    const { renderedW, renderedH } = objectContainDims(cw, ch, aspect);
    // renderedW = min(1920, 1080*1) = 1080
    // renderedH = min(1080, 1920/1) = 1080

    const maxX = (renderedW * scale - cw) / 2; // (5400 - 1920) / 2 = 1740
    const maxY = (renderedH * scale - ch) / 2; // (5400 - 1080) / 2 = 2160

    const maxResult = clampTranslate(9999, 9999, scale, cw, ch, aspect);
    expect(maxResult.tx).toBeCloseTo(maxX, 0);
    expect(maxResult.ty).toBeCloseTo(maxY, 0);
  });
});
