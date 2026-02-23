import { describe, it, expect } from 'vitest';
import { getFriendlyBandLabel } from '../components/GoesData/liveTabUtils';

describe('getFriendlyBandLabel', () => {
  describe('short mode', () => {
    it('returns bandId + friendly name for known band', () => {
      expect(getFriendlyBandLabel('C02', 'Red', true)).toBe('C02 Visible Red');
    });

    it('returns GeoColor for GEOCOLOR', () => {
      expect(getFriendlyBandLabel('GEOCOLOR', undefined, true)).toBe('GeoColor');
    });

    it('returns raw bandId for unknown band', () => {
      expect(getFriendlyBandLabel('C99', undefined, true)).toBe('C99');
    });
  });

  describe('full mode (short=false)', () => {
    it('returns full label with description', () => {
      expect(getFriendlyBandLabel('C02', 'Red', false)).toBe('Visible Red (C02 — Red)');
    });

    it('returns full label without description', () => {
      expect(getFriendlyBandLabel('C02', undefined, false)).toBe('Visible Red (C02)');
    });

    it('returns bandId with description for unknown band', () => {
      expect(getFriendlyBandLabel('C99', 'Unknown', false)).toBe('C99 — Unknown');
    });

    it('returns raw bandId for unknown band without description', () => {
      expect(getFriendlyBandLabel('C99', undefined, false)).toBe('C99');
    });

    it('returns friendly name for GEOCOLOR', () => {
      expect(getFriendlyBandLabel('GEOCOLOR', undefined, false)).toBe('GeoColor (True Color)');
    });
  });
});
