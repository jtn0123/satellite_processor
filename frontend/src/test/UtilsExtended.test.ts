import { describe, it, expect } from 'vitest';
import { formatBytes } from '../components/GoesData/utils';

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(2048000)).toBe('2 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('formats terabytes', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB');
  });
});
