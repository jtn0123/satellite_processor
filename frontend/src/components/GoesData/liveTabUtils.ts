/** Shared helpers for LiveTab — extracted for react-refresh compatibility */

import { isHimawariSatellite } from '../../utils/sectorHelpers';

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

export const HIMAWARI_BAND_NAMES: Record<string, string> = {
  B01: 'Visible Blue',
  B02: 'Visible Green',
  B03: 'Visible Red',
  B04: 'Near-IR Veggie',
  B05: 'Snow/Ice',
  B06: 'Cloud Particle',
  B07: 'Shortwave IR',
  B08: 'Upper Water Vapor',
  B09: 'Mid Water Vapor',
  B10: 'Lower Water Vapor',
  B11: 'Cloud-Top Phase',
  B12: 'Ozone',
  B13: 'Clean IR Longwave',
  B14: 'IR Longwave',
  B15: 'Dirty Longwave',
  B16: 'CO₂ Longwave',
  TrueColor: 'True Color (RGB)',
};

/** Get the correct band name mapping for a satellite. */
function getBandNames(satellite?: string): Record<string, string> {
  if (satellite && isHimawariSatellite(satellite)) return HIMAWARI_BAND_NAMES;
  return FRIENDLY_BAND_NAMES;
}

function formatShort(bandId: string, friendly?: string): string {
  if (bandId === 'GEOCOLOR') return 'GeoColor';
  if (bandId === 'TrueColor') return 'TrueColor';
  return friendly ? `${bandId} ${friendly}` : bandId;
}

function formatMedium(bandId: string, friendly?: string, description?: string): string {
  const label = friendly ?? description;
  return label ? `${bandId} — ${label}` : bandId;
}

function formatLong(bandId: string, friendly?: string, description?: string): string {
  if (friendly && description) return `${friendly} (${bandId} — ${description})`;
  if (friendly) return `${friendly} (${bandId})`;
  return formatMedium(bandId, friendly, description);
}

export function getFriendlyBandLabel(bandId: string, description?: string, format?: 'short' | 'medium' | 'long', satellite?: string): string {
  const names = getBandNames(satellite);
  const friendly = names[bandId];

  if ((bandId === 'GEOCOLOR' || bandId === 'TrueColor') && format !== 'short') return friendly ?? bandId;

  switch (format) {
    case 'short': return formatShort(bandId, friendly);
    case 'long': return formatLong(bandId, friendly, description);
    default: return formatMedium(bandId, friendly, description);
  }
}

export function getFriendlyBandName(bandId: string, satellite?: string): string {
  const names = getBandNames(satellite);
  return names[bandId] ?? bandId;
}

export interface CachedImageMeta {
  url: string;
  satellite: string;
  band: string;
  sector: string;
  timestamp: string;
}

export const REFRESH_INTERVALS = [
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: '10 min', value: 600000 },
  { label: '30 min', value: 1800000 },
];

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CACHE_PREFIX = 'live-cache:';
const MAX_CACHED = 6;

export function saveCachedImage(url: string, meta: Omit<CachedImageMeta, 'url'>) {
  try {
    const key = `${CACHE_PREFIX}${meta.satellite}:${meta.sector}:${meta.band}`;
    localStorage.setItem(key, JSON.stringify({ url, ...meta }));
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    if (allKeys.length > MAX_CACHED) {
      const entries = allKeys.map(k => {
        try { return { key: k, ts: JSON.parse(localStorage.getItem(k) ?? '{}').timestamp ?? '' }; }
        catch { return { key: k, ts: '' }; }
      }).sort((a, b) => a.ts.localeCompare(b.ts));
      for (let i = 0; i < entries.length - MAX_CACHED; i++) {
        localStorage.removeItem(entries[i].key);
      }
    }
  } catch { /* storage full — ignore */ }
}

export function loadCachedImage(satellite?: string, sector?: string, band?: string): CachedImageMeta | null {
  try {
    if (satellite && sector && band) {
      const key = `${CACHE_PREFIX}${satellite}:${sector}:${band}`;
      const data = localStorage.getItem(key);
      if (data) return JSON.parse(data) as CachedImageMeta;
    }
    // Only return exact-match cache to avoid showing wrong band's image
    return null;
  } catch { return null; }
}

/**
 * Get the previous band index (wraps around).
 * Returns -1 if bands list is empty.
 */
export function getPrevBandIndex(currentIdx: number, length: number): number {
  if (length === 0) return -1;
  return currentIdx > 0 ? currentIdx - 1 : length - 1;
}

/**
 * Get the next band index (wraps around).
 * Returns -1 if bands list is empty.
 */
export function getNextBandIndex(currentIdx: number, length: number): number {
  if (length === 0) return -1;
  return currentIdx < length - 1 ? currentIdx + 1 : 0;
}
