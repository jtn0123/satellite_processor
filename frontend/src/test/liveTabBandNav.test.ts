import { describe, it, expect } from 'vitest';
import { getPrevBandIndex, getNextBandIndex } from '../components/GoesData/liveTabUtils';

describe('getPrevBandIndex', () => {
  it('returns -1 for empty list', () => {
    expect(getPrevBandIndex(0, 0)).toBe(-1);
  });

  it('wraps to last index when at first', () => {
    expect(getPrevBandIndex(0, 5)).toBe(4);
  });

  it('returns previous index normally', () => {
    expect(getPrevBandIndex(3, 5)).toBe(2);
  });

  it('handles single-element list', () => {
    expect(getPrevBandIndex(0, 1)).toBe(0);
  });
});

describe('getNextBandIndex', () => {
  it('returns -1 for empty list', () => {
    expect(getNextBandIndex(0, 0)).toBe(-1);
  });

  it('wraps to first index when at last', () => {
    expect(getNextBandIndex(4, 5)).toBe(0);
  });

  it('returns next index normally', () => {
    expect(getNextBandIndex(2, 5)).toBe(3);
  });

  it('handles single-element list', () => {
    expect(getNextBandIndex(0, 1)).toBe(0);
  });
});
