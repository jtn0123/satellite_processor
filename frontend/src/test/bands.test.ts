import { describe, it, expect } from 'vitest';
import { BAND_INFO, getBandLabel } from '../constants/bands';

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
