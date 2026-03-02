import { describe, it, expect } from 'vitest';
import { clampTranslate } from './useImageZoom';

describe('clampTranslate', () => {
  // Container 1000x600, image aspect 5/3 → rendered 1000x600 (fits exactly)
  const containerW = 1000;
  const containerH = 600;
  const aspect = 5 / 3;

  it('returns zero translate at scale <= 1', () => {
    const result = clampTranslate(500, 300, 1, containerW, containerH, aspect);
    expect(result).toEqual({ tx: 0, ty: 0 });
  });

  it('allows panning to the correct right edge at scale=5', () => {
    const scale = 5;
    // renderedW = min(1000, 600 * 5/3) = 1000
    const renderedW = Math.min(containerW, containerH * aspect);
    const expectedMaxX = (renderedW * scale - containerW) / 2;
    // expectedMaxX = (1000*5 - 1000)/2 = 2000

    const result = clampTranslate(9999, 0, scale, containerW, containerH, aspect);
    expect(result.tx).toBe(expectedMaxX);
    expect(expectedMaxX).toBe(2000);
  });

  it('bug regression: old code divided translate by scale, limiting pan range', () => {
    // The old bug: translate(x/scale, y/scale) meant at scale=5, max visible
    // pan was only maxX/scale = 2000/5 = 400px instead of 2000px.
    // The hook uses translate(Xpx, Ypx) scale(S) — no division by scale.
    const scale = 5;
    const renderedW = Math.min(containerW, containerH * aspect);
    const correctMaxX = (renderedW * scale - containerW) / 2; // 2000
    const buggyMaxX = correctMaxX / scale; // 400 — wrong!

    expect(correctMaxX).toBe(2000);
    expect(buggyMaxX).toBe(400);
    expect(correctMaxX).toBeGreaterThan(buggyMaxX);

    // clampTranslate returns the correct (non-divided) value
    const result = clampTranslate(correctMaxX, 0, scale, containerW, containerH, aspect);
    expect(result.tx).toBe(correctMaxX);
  });

  it('clamps negative direction symmetrically', () => {
    const scale = 3;
    const renderedW = Math.min(containerW, containerH * aspect);
    const maxX = (renderedW * scale - containerW) / 2; // (3000-1000)/2 = 1000

    const result = clampTranslate(-9999, 0, scale, containerW, containerH, aspect);
    expect(result.tx).toBe(-maxX);
  });

  it('clamps Y axis based on rendered height', () => {
    const scale = 4;
    const renderedH = Math.min(containerH, containerW / aspect); // 600
    const maxY = (renderedH * scale - containerH) / 2; // (2400-600)/2 = 900

    const result = clampTranslate(0, 9999, scale, containerW, containerH, aspect);
    expect(result.ty).toBe(maxY);
  });
});
