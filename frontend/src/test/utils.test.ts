import { describe, it, expect } from 'vitest';
import { formatBytes } from '../components/GoesData/utils';
import { extractArray, safeNumber, safeMax } from '../utils/safeData';

describe('GoesData utils', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
    });

    it('formats fractional values', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('handles negative values', () => {
      // Should not crash
      const result = formatBytes(-1);
      expect(typeof result).toBe('string');
    });

    it('handles very large values', () => {
      const result = formatBytes(1e15);
      expect(typeof result).toBe('string');
    });

    it('handles NaN without throwing', () => {
      expect(() => formatBytes(NaN)).not.toThrow();
    });

    it('handles undefined without throwing (defensive)', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => formatBytes(undefined as any)).not.toThrow();
    });
  });
});

describe('safeData utilities', () => {
  describe('extractArray', () => {
    it('returns array directly', () => {
      expect(extractArray([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('extracts items from object', () => {
      expect(extractArray({ items: [1, 2] })).toEqual([1, 2]);
    });

    it('returns empty array for undefined', () => {
      expect(extractArray(undefined)).toEqual([]);
    });

    it('returns empty array for null', () => {
      expect(extractArray(null)).toEqual([]);
    });

    it('returns empty array for plain object without items', () => {
      expect(extractArray({ foo: 'bar' })).toEqual([]);
    });

    it('returns empty array when items is not an array', () => {
      expect(extractArray({ items: 'not-array' })).toEqual([]);
    });

    it('returns empty array for empty array', () => {
      expect(extractArray([])).toEqual([]);
    });
  });

  describe('safeNumber', () => {
    it('returns number for valid number', () => {
      expect(safeNumber(42)).toBe(42);
    });

    it('returns fallback for undefined', () => {
      expect(safeNumber(undefined)).toBe(0);
    });

    it('returns fallback for null', () => {
      expect(safeNumber(null)).toBe(0);
    });

    it('returns fallback for NaN', () => {
      expect(safeNumber(NaN)).toBe(0);
    });

    it('returns fallback for string', () => {
      expect(safeNumber('hello')).toBe(0);
    });

    it('uses custom fallback', () => {
      expect(safeNumber(undefined, 99)).toBe(99);
    });

    it('returns 0 for zero', () => {
      expect(safeNumber(0)).toBe(0);
    });
  });

  describe('safeMax', () => {
    it('returns max of values', () => {
      expect(safeMax(1, 5, 3)).toBe(5);
    });

    it('returns 0 for empty args', () => {
      expect(safeMax()).toBe(0);
    });

    it('handles single value', () => {
      expect(safeMax(42)).toBe(42);
    });

    it('handles negative values', () => {
      expect(safeMax(-5, -1, -10)).toBe(-1);
    });

    it('returns 0 for Infinity edge cases', () => {
      expect(safeMax(Infinity, -Infinity)).toBe(0);
    });
  });
});
// Coverage validation
