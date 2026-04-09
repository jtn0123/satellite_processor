import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatDuration,
  formatImageType,
  formatJobType,
  formatSectorName,
  truncate,
} from '../utils/formatters';

describe('formatBytes', () => {
  it('returns 0 Bytes for zero', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('formats megabytes with decimals', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('respects decimal parameter', () => {
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('formats hours', () => {
    expect(formatDuration(3600)).toBe('1h');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3720)).toBe('1h 2m');
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
  });

  it('handles exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

// JTN-434 ISSUE-023: image-type and job-type display had inconsistent
// casing across surfaces. These formatters are the single source of truth.
describe('formatImageType', () => {
  it('renders Single Band with the band id', () => {
    expect(formatImageType('single', 'C02')).toBe('Single Band (C02)');
  });

  it('renders Single Band without a band id', () => {
    expect(formatImageType('single')).toBe('Single Band');
  });

  it('renders True Color in title case (not "true color")', () => {
    expect(formatImageType('true_color')).toBe('True Color');
  });

  it('renders Natural Color in title case', () => {
    expect(formatImageType('natural_color')).toBe('Natural Color');
  });

  it('falls back to title-casing unknown values', () => {
    expect(formatImageType('some_other_type')).toBe('Some Other Type');
  });
});

describe('formatJobType', () => {
  it('title-cases snake_case job types', () => {
    expect(formatJobType('goes_fetch_composite')).toBe('GOES Fetch Composite');
  });

  it('keeps known acronyms uppercase', () => {
    expect(formatJobType('goes_fetch')).toBe('GOES Fetch');
    expect(formatJobType('himawari_import')).toBe('HIMAWARI Import');
  });

  it('returns "Unknown job" for empty input', () => {
    expect(formatJobType('')).toBe('Unknown job');
  });
});

describe('formatSectorName', () => {
  it('inserts a space in FullDisk', () => {
    expect(formatSectorName('FullDisk')).toBe('Full Disk');
  });

  it('inserts a space in Mesoscale1/2', () => {
    expect(formatSectorName('Mesoscale1')).toBe('Mesoscale 1');
    expect(formatSectorName('Mesoscale2')).toBe('Mesoscale 2');
  });

  it('leaves CONUS unchanged', () => {
    expect(formatSectorName('CONUS')).toBe('CONUS');
  });
});
