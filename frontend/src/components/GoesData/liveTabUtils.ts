/** Shared helpers for LiveTab — extracted for react-refresh compatibility */

export const FRIENDLY_BAND_NAMES: Record<string, string> = {
  C01: 'Visible Blue',
  C02: 'Visible Red',
  C03: 'Near-IR Veggie',
  C04: 'Cirrus',
  C05: 'Snow/Ice',
  C06: 'Cloud Particle Size',
  C07: 'Shortwave IR',
  C08: 'Upper Water Vapor',
  C09: 'Mid Water Vapor',
  C10: 'Lower Water Vapor',
  C11: 'Cloud-Top Phase',
  C12: 'Ozone',
  C13: 'Clean IR Longwave',
  C14: 'IR Longwave',
  C15: 'Dirty Longwave',
  C16: 'CO₂ Longwave',
  GEOCOLOR: 'GeoColor (True Color)',
};

export function getFriendlyBandLabel(bandId: string, description?: string, format?: 'short' | 'medium' | 'long'): string {
  const friendly = FRIENDLY_BAND_NAMES[bandId];
  if (bandId === 'GEOCOLOR') return format === 'short' ? 'GeoColor' : (friendly ?? bandId);
  if (format === 'short') return friendly ? `${bandId} ${friendly}` : bandId;
  // Medium: "C02 — Visible Red" (no wavelength)
  if (!format || format === 'medium') return friendly ? `${bandId} — ${friendly}` : (description ? `${bandId} — ${description}` : bandId);
  // Long: "Visible Red (C02 — Red (0.64μm))"
  if (friendly && description) return `${friendly} (${bandId} — ${description})`;
  if (friendly) return `${friendly} (${bandId})`;
  return description ? `${bandId} — ${description}` : bandId;
}

export function getFriendlyBandName(bandId: string): string {
  return FRIENDLY_BAND_NAMES[bandId] ?? bandId;
}

export interface CachedImageMeta {
  url: string;
  satellite: string;
  band: string;
  sector: string;
  timestamp: string;
}

const CACHE_KEY_META = 'live-last-image-meta';

export function saveCachedImage(url: string, meta: Omit<CachedImageMeta, 'url'>) {
  try {
    localStorage.setItem(CACHE_KEY_META, JSON.stringify({ url, ...meta }));
  } catch { /* storage full — ignore */ }
}

export function loadCachedImage(): CachedImageMeta | null {
  try {
    const meta = localStorage.getItem(CACHE_KEY_META);
    if (meta) return JSON.parse(meta) as CachedImageMeta;
  } catch { /* corrupted — ignore */ }
  return null;
}
