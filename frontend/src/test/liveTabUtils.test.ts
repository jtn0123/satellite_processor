import { describe, it, expect, beforeEach } from 'vitest';
import { getFriendlyBandLabel, saveCachedImage, loadCachedImage } from '../components/GoesData/liveTabUtils';

describe('getFriendlyBandLabel', () => {
  describe('short mode', () => {
    it('returns bandId + friendly name for known band', () => {
      expect(getFriendlyBandLabel('C02', 'Red', 'short')).toBe('C02 Visible Red');
    });

    it('returns GeoColor for GEOCOLOR', () => {
      expect(getFriendlyBandLabel('GEOCOLOR', undefined, 'short')).toBe('GeoColor');
    });

    it('returns raw bandId for unknown band', () => {
      expect(getFriendlyBandLabel('C99', undefined, 'short')).toBe('C99');
    });
  });

  describe('medium mode (default)', () => {
    it('returns medium label with friendly name', () => {
      expect(getFriendlyBandLabel('C02', 'Red')).toBe('C02 — Visible Red');
    });

    it('returns medium label without friendly name', () => {
      expect(getFriendlyBandLabel('C99', 'Unknown')).toBe('C99 — Unknown');
    });

    it('returns raw bandId for unknown band without description', () => {
      expect(getFriendlyBandLabel('C99')).toBe('C99');
    });

    it('returns friendly name for GEOCOLOR', () => {
      expect(getFriendlyBandLabel('GEOCOLOR')).toBe('GeoColor (True Color)');
    });
  });

  describe('long mode', () => {
    it('returns full label with description', () => {
      expect(getFriendlyBandLabel('C02', 'Red', 'long')).toBe('Visible Red (C02 — Red)');
    });

    it('returns full label without description', () => {
      expect(getFriendlyBandLabel('C02', undefined, 'long')).toBe('Visible Red (C02)');
    });

    it('returns bandId with description for unknown band', () => {
      expect(getFriendlyBandLabel('C99', 'Unknown', 'long')).toBe('C99 — Unknown');
    });

    it('returns raw bandId for unknown band without description', () => {
      expect(getFriendlyBandLabel('C99', undefined, 'long')).toBe('C99');
    });

    it('returns friendly name for GEOCOLOR', () => {
      expect(getFriendlyBandLabel('GEOCOLOR', undefined, 'long')).toBe('GeoColor (True Color)');
    });
  });
});

describe('loadCachedImage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns exact match when satellite/sector/band provided', () => {
    saveCachedImage('https://cdn.test/img.jpg', {
      satellite: 'GOES-16',
      band: 'C02',
      sector: 'CONUS',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const result = loadCachedImage('GOES-16', 'CONUS', 'C02');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://cdn.test/img.jpg');
  });

  it('returns null when no exact match exists — no cross-band fallback', () => {
    saveCachedImage('https://cdn.test/c02.jpg', {
      satellite: 'GOES-16',
      band: 'C02',
      sector: 'CONUS',
      timestamp: '2024-01-01T00:00:00Z',
    });

    // Requesting C13 should NOT fall back to C02's cached image
    const result = loadCachedImage('GOES-16', 'CONUS', 'C13');
    expect(result).toBeNull();
  });

  it('returns null when called without params — no arbitrary fallback', () => {
    saveCachedImage('https://cdn.test/img.jpg', {
      satellite: 'GOES-16',
      band: 'C02',
      sector: 'CONUS',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const result = loadCachedImage();
    expect(result).toBeNull();
  });
});
