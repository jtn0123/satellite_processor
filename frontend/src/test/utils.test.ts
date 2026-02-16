import { describe, it, expect } from 'vitest';
import { formatBytes } from '../components/GoesData/utils';

describe('GoesData utils', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatBytes(500)).toBe('500.0 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1.0 GB');
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
