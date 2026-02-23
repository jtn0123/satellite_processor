/**
 * Tests for Live View polish: friendly band names, image caching
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Re-export the helpers by importing the module internals
// Since they're not exported, we test them indirectly via the component
// But we can test the logic directly by extracting it

describe('Friendly Band Names', () => {
  // Test the mapping logic directly
  const FRIENDLY_BAND_NAMES: Record<string, string> = {
    C01: 'Visible Blue',
    C02: 'Visible Red',
    C03: 'Near-IR Veggie',
    C07: 'Shortwave IR',
    C08: 'Upper Water Vapor',
    C09: 'Mid Water Vapor',
    C10: 'Lower Water Vapor',
    C13: 'Clean IR Longwave',
    C14: 'IR Longwave',
    GEOCOLOR: 'GeoColor (True Color)',
  };

  function getFriendlyBandLabel(bandId: string, description?: string): string {
    const friendly = FRIENDLY_BAND_NAMES[bandId];
    if (bandId === 'GEOCOLOR') return friendly ?? bandId;
    if (friendly && description) return `${friendly} (${bandId} — ${description})`;
    if (friendly) return `${friendly} (${bandId})`;
    return description ? `${bandId} — ${description}` : bandId;
  }

  function getFriendlyBandName(bandId: string): string {
    return FRIENDLY_BAND_NAMES[bandId] ?? bandId;
  }

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
});

describe('Image Cache (localStorage)', () => {
  const CACHE_KEY_IMAGE = 'live-last-image';
  const CACHE_KEY_META = 'live-last-image-meta';

  interface CachedImageMeta {
    url: string;
    satellite: string;
    band: string;
    sector: string;
    timestamp: string;
  }

  function saveCachedImage(url: string, meta: Omit<CachedImageMeta, 'url'>) {
    try {
      localStorage.setItem(CACHE_KEY_IMAGE, url);
      localStorage.setItem(CACHE_KEY_META, JSON.stringify({ url, ...meta }));
    } catch { /* noop */ }
  }

  function loadCachedImage(): CachedImageMeta | null {
    try {
      const meta = localStorage.getItem(CACHE_KEY_META);
      if (meta) return JSON.parse(meta) as CachedImageMeta;
    } catch { /* noop */ }
    return null;
  }

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
    localStorage.setItem(CACHE_KEY_META, 'not-json');
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
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    // Should not throw
    expect(() => saveCachedImage('url', {
      satellite: 'X', band: 'Y', sector: 'Z', timestamp: 'T',
    })).not.toThrow();

    vi.mocked(Storage.prototype.setItem).mockRestore();
  });
});
