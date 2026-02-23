/**
 * Tests for Live View polish: friendly band names, image caching
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FRIENDLY_BAND_NAMES,
  getFriendlyBandLabel,
  getFriendlyBandName,
  saveCachedImage,
  loadCachedImage,
} from '../components/GoesData/liveTabUtils';

describe('Friendly Band Names', () => {
  it('formats C02 with description', () => {
    expect(getFriendlyBandLabel('C02', 'Red (0.64µm)')).toBe('Visible Red (C02 — Red (0.64µm))');
  });

  it('formats C13 with description', () => {
    expect(getFriendlyBandLabel('C13', 'Clean IR Longwave (10.3µm)')).toBe(
      'Clean IR Longwave (C13 — Clean IR Longwave (10.3µm))',
    );
  });

  it('formats GEOCOLOR without parentheses', () => {
    expect(getFriendlyBandLabel('GEOCOLOR', 'GeoColor')).toBe('GeoColor (True Color)');
  });

  it('falls back for unknown band', () => {
    expect(getFriendlyBandLabel('C99', 'Unknown')).toBe('C99 — Unknown');
  });

  it('falls back for unknown band without description', () => {
    expect(getFriendlyBandLabel('C99')).toBe('C99');
  });

  it('returns friendly name for badge', () => {
    expect(getFriendlyBandName('C02')).toBe('Visible Red');
    expect(getFriendlyBandName('C08')).toBe('Upper Water Vapor');
  });

  it('returns band ID for unknown bands in badge', () => {
    expect(getFriendlyBandName('C99')).toBe('C99');
  });

  it('has expected keys in FRIENDLY_BAND_NAMES', () => {
    expect(FRIENDLY_BAND_NAMES).toHaveProperty('C02', 'Visible Red');
    expect(FRIENDLY_BAND_NAMES).toHaveProperty('GEOCOLOR', 'GeoColor (True Color)');
  });
});

describe('Image Cache (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads cached image', () => {
    saveCachedImage('https://example.com/img.jpg', {
      satellite: 'GOES-19',
      band: 'C02',
      sector: 'CONUS',
      timestamp: '2026-02-22T22:10:00Z',
    });

    const cached = loadCachedImage();
    expect(cached).not.toBeNull();
    expect(cached!.url).toBe('https://example.com/img.jpg');
    expect(cached!.satellite).toBe('GOES-19');
    expect(cached!.band).toBe('C02');
    expect(cached!.timestamp).toBe('2026-02-22T22:10:00Z');
  });

  it('returns null when no cache exists', () => {
    expect(loadCachedImage()).toBeNull();
  });

  it('handles corrupted cache gracefully', () => {
    localStorage.setItem('live-last-image-meta', 'not-json');
    expect(loadCachedImage()).toBeNull();
  });

  it('overwrites previous cache', () => {
    saveCachedImage('https://example.com/old.jpg', {
      satellite: 'GOES-16', band: 'C13', sector: 'FullDisk', timestamp: '2026-01-01T00:00:00Z',
    });
    saveCachedImage('https://example.com/new.jpg', {
      satellite: 'GOES-19', band: 'C02', sector: 'CONUS', timestamp: '2026-02-22T22:10:00Z',
    });

    const cached = loadCachedImage();
    expect(cached!.url).toBe('https://example.com/new.jpg');
  });

  it('handles localStorage quota error gracefully', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    // Should not throw
    expect(() => saveCachedImage('url', {
      satellite: 'X', band: 'Y', sector: 'Z', timestamp: 'T',
    })).not.toThrow();

    spy.mockRestore();
  });
});
