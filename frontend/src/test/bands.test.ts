import { describe, it, expect } from 'vitest';
import { BAND_INFO, getBandLabel } from '../constants/bands';
import {
  FRIENDLY_BAND_NAMES,
  HIMAWARI_BAND_NAMES,
  getFriendlyBandLabel,
  getFriendlyBandName,
} from '../components/GoesData/liveTabUtils';

describe('bands constants', () => {
  it('exports BAND_INFO with all 16 bands', () => {
    expect(Object.keys(BAND_INFO).length).toBe(16);
  });

  it('getBandLabel returns formatted label for known band', () => {
    const label = getBandLabel('C02');
    expect(label).toContain('C02');
    expect(label).toContain('Red');
    expect(label).toContain('0.64μm');
  });

  it('getBandLabel returns band id for unknown band', () => {
    expect(getBandLabel('ZZZZ')).toBe('ZZZZ');
  });

  it('each band has required properties', () => {
    for (const [key, info] of Object.entries(BAND_INFO)) {
      expect(key).toMatch(/^C\d{2}$/);
      expect(info.name).toBeTruthy();
      expect(info.wavelength).toBeTruthy();
      expect(info.category).toBeTruthy();
      expect(info.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(info.description).toBeTruthy();
    }
  });
});

describe('GOES friendly band names', () => {
  it('has 17 entries (16 bands + GEOCOLOR)', () => {
    expect(Object.keys(FRIENDLY_BAND_NAMES).length).toBe(17);
  });

  it('getFriendlyBandName returns name for GOES bands', () => {
    expect(getFriendlyBandName('C01')).toBe('Visible Blue');
    expect(getFriendlyBandName('GEOCOLOR')).toBe('GeoColor (True Color)');
  });

  it('getFriendlyBandName returns bandId for unknown band', () => {
    expect(getFriendlyBandName('ZZZZ')).toBe('ZZZZ');
  });

  it('getFriendlyBandLabel defaults to GOES without satellite param', () => {
    const label = getFriendlyBandLabel('C02', undefined, 'medium');
    expect(label).toContain('C02');
    expect(label).toContain('Visible Red');
  });
});

describe('Himawari friendly band names', () => {
  it('has 17 entries (16 bands + TrueColor)', () => {
    expect(Object.keys(HIMAWARI_BAND_NAMES).length).toBe(17);
  });

  it('getFriendlyBandName returns name for Himawari bands', () => {
    expect(getFriendlyBandName('B01', 'Himawari-9')).toBe('Visible Blue');
    expect(getFriendlyBandName('B02', 'Himawari-9')).toBe('Visible Green');
    expect(getFriendlyBandName('TrueColor', 'Himawari-9')).toBe('True Color (RGB)');
  });

  it('getFriendlyBandName falls back to bandId for unknown Himawari band', () => {
    expect(getFriendlyBandName('C01', 'Himawari-9')).toBe('C01');
  });

  it('getFriendlyBandLabel uses Himawari mapping when satellite provided', () => {
    const label = getFriendlyBandLabel('B03', undefined, 'medium', 'Himawari-9');
    expect(label).toContain('B03');
    expect(label).toContain('Visible Red');
  });

  it('getFriendlyBandLabel short format for TrueColor', () => {
    const label = getFriendlyBandLabel('TrueColor', undefined, 'short', 'Himawari-9');
    expect(label).toBe('TrueColor');
  });

  it('getFriendlyBandLabel returns full name for TrueColor in medium format', () => {
    const label = getFriendlyBandLabel('TrueColor', undefined, 'medium', 'Himawari-9');
    expect(label).toBe('True Color (RGB)');
  });
});
