import { describe, it, expect } from 'vitest';
import { extractArray, safeNumber, safeMax } from '../utils/safeData';

describe('extractArray', () => {
  it('returns array as-is', () => {
    expect(extractArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns empty array for null', () => {
    expect(extractArray(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(extractArray(undefined)).toEqual([]);
  });

  it('extracts items from paginated object', () => {
    expect(extractArray({ items: [1, 2], total: 2 })).toEqual([1, 2]);
  });

  it('returns empty array when items is not an array', () => {
    expect(extractArray({ items: 'not-array' })).toEqual([]);
  });

  it('returns empty array for string', () => {
    expect(extractArray('hello')).toEqual([]);
  });

  it('returns empty array for number', () => {
    expect(extractArray(42)).toEqual([]);
  });

  it('returns empty array for object without items', () => {
    expect(extractArray({ detail: 'error' })).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(extractArray({})).toEqual([]);
  });

  it('handles empty array', () => {
    expect(extractArray([])).toEqual([]);
  });

  it('handles object with empty items array', () => {
    expect(extractArray({ items: [] })).toEqual([]);
  });

  it('returns empty array for boolean', () => {
    expect(extractArray(true)).toEqual([]);
  });
});

describe('safeNumber', () => {
  it('returns number as-is', () => {
    expect(safeNumber(42)).toBe(42);
  });

  it('returns 0 for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(safeNumber(NaN)).toBe(0);
  });

  it('returns fallback for NaN', () => {
    expect(safeNumber(NaN, 5)).toBe(5);
  });

  it('returns fallback for string', () => {
    expect(safeNumber('hello', 10)).toBe(10);
  });

  it('returns 0 for string without fallback', () => {
    expect(safeNumber('hello')).toBe(0);
  });

  it('handles zero', () => {
    expect(safeNumber(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(safeNumber(-5)).toBe(-5);
  });

  it('handles Infinity', () => {
    expect(safeNumber(Infinity)).toBe(Infinity);
  });

  it('returns fallback for boolean', () => {
    expect(safeNumber(true, 99)).toBe(99);
  });

  it('returns fallback for object', () => {
    expect(safeNumber({}, 7)).toBe(7);
  });
});

describe('safeMax', () => {
  it('returns max of values', () => {
    expect(safeMax(1, 5, 3)).toBe(5);
  });

  it('returns 0 for no arguments', () => {
    expect(safeMax()).toBe(0);
  });

  it('handles single value', () => {
    expect(safeMax(42)).toBe(42);
  });

  it('handles negative values', () => {
    expect(safeMax(-5, -1, -10)).toBe(-1);
  });

  it('handles mixed positive and negative', () => {
    expect(safeMax(-5, 0, 5)).toBe(5);
  });

  it('returns 0 for -Infinity', () => {
    expect(safeMax(-Infinity)).toBe(0);
  });

  it('handles zero values', () => {
    expect(safeMax(0, 0, 0)).toBe(0);
  });
});
