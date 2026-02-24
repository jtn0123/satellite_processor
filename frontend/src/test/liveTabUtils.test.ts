import { describe, it, expect } from 'vitest';
import { getFriendlyBandLabel } from '../components/GoesData/liveTabUtils';

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
