import { describe, it, expect } from 'vitest';
import {
  isHimawariSatellite,
  isMesoSector,
  isRegionalSector,
  isCompositeBandAvailable,
  isGeocolorAvailable,
  buildCdnUrl,
  getDefaultBand,
  getDefaultSector,
} from '../utils/sectorHelpers';

describe('isHimawariSatellite', () => {
  it('returns true for Himawari-9', () => {
    expect(isHimawariSatellite('Himawari-9')).toBe(true);
  });

  it('returns true for case-insensitive match', () => {
    expect(isHimawariSatellite('himawari-9')).toBe(true);
    expect(isHimawariSatellite('HIMAWARI-9')).toBe(true);
  });

  it('returns true for shorthand H9/H8', () => {
    expect(isHimawariSatellite('H9')).toBe(true);
    expect(isHimawariSatellite('h8')).toBe(true);
  });

  it('returns false for GOES satellites', () => {
    expect(isHimawariSatellite('GOES-16')).toBe(false);
    expect(isHimawariSatellite('GOES-18')).toBe(false);
    expect(isHimawariSatellite('GOES-19')).toBe(false);
  });
});

describe('isMesoSector', () => {
  it('detects mesoscale sectors', () => {
    expect(isMesoSector('Mesoscale1')).toBe(true);
    expect(isMesoSector('Mesoscale2')).toBe(true);
  });

  it('rejects non-meso sectors', () => {
    expect(isMesoSector('CONUS')).toBe(false);
    expect(isMesoSector('FullDisk')).toBe(false);
    expect(isMesoSector('FLDK')).toBe(false);
  });
});

describe('isRegionalSector', () => {
  it('returns true for GOES meso sectors', () => {
    expect(isRegionalSector('GOES-16', 'Mesoscale1')).toBe(true);
    expect(isRegionalSector('GOES-18', 'Mesoscale2')).toBe(true);
  });

  it('returns false for GOES non-meso sectors', () => {
    expect(isRegionalSector('GOES-16', 'CONUS')).toBe(false);
    expect(isRegionalSector('GOES-16', 'FullDisk')).toBe(false);
  });

  it('returns true for Himawari Japan/Target sectors', () => {
    expect(isRegionalSector('Himawari-9', 'Japan')).toBe(true);
    expect(isRegionalSector('Himawari-9', 'Target')).toBe(true);
  });

  it('returns false for Himawari FLDK', () => {
    expect(isRegionalSector('Himawari-9', 'FLDK')).toBe(false);
  });
});

describe('isCompositeBandAvailable', () => {
  it('returns true for GOES non-meso sectors', () => {
    expect(isCompositeBandAvailable('GOES-16', 'CONUS')).toBe(true);
    expect(isCompositeBandAvailable('GOES-18', 'FullDisk')).toBe(true);
  });

  it('returns false for GOES meso sectors', () => {
    expect(isCompositeBandAvailable('GOES-16', 'Mesoscale1')).toBe(false);
  });

  it('returns true for all Himawari sectors', () => {
    expect(isCompositeBandAvailable('Himawari-9', 'FLDK')).toBe(true);
    expect(isCompositeBandAvailable('Himawari-9', 'Japan')).toBe(true);
    expect(isCompositeBandAvailable('Himawari-9', 'Target')).toBe(true);
  });
});

describe('isGeocolorAvailable (deprecated)', () => {
  it('still works for backward compat', () => {
    expect(isGeocolorAvailable('CONUS')).toBe(true);
    expect(isGeocolorAvailable('Mesoscale1')).toBe(false);
  });
});

describe('buildCdnUrl', () => {
  it('builds valid URL for GOES CONUS', () => {
    const url = buildCdnUrl('GOES-16', 'CONUS', 'C02');
    expect(url).toContain('cdn.star.nesdis.noaa.gov');
    expect(url).toContain('GOES16');
    expect(url).toContain('CONUS');
  });

  it('builds valid URL for GOES GEOCOLOR', () => {
    const url = buildCdnUrl('GOES-18', 'FullDisk', 'GEOCOLOR');
    expect(url).toContain('GEOCOLOR');
    expect(url).toContain('FD');
  });

  it('returns null for meso sectors', () => {
    expect(buildCdnUrl('GOES-16', 'Mesoscale1', 'C02')).toBeNull();
  });

  it('returns null for Himawari satellites', () => {
    expect(buildCdnUrl('Himawari-9', 'FLDK', 'B01')).toBeNull();
    expect(buildCdnUrl('Himawari-9', 'Japan', 'TrueColor')).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(buildCdnUrl('', 'CONUS', 'C02')).toBeNull();
    expect(buildCdnUrl('GOES-16', '', 'C02')).toBeNull();
    expect(buildCdnUrl('GOES-16', 'CONUS', '')).toBeNull();
  });

  it('uses mobile resolution when requested', () => {
    const url = buildCdnUrl('GOES-16', 'CONUS', 'C02', true);
    expect(url).toContain('1250x750');
  });
});

describe('getDefaultBand', () => {
  it('returns GEOCOLOR for GOES', () => {
    expect(getDefaultBand('GOES-16')).toBe('GEOCOLOR');
    expect(getDefaultBand('GOES-18')).toBe('GEOCOLOR');
  });

  it('returns TrueColor for Himawari', () => {
    expect(getDefaultBand('Himawari-9')).toBe('TrueColor');
  });
});

describe('getDefaultSector', () => {
  it('returns CONUS for GOES', () => {
    expect(getDefaultSector('GOES-16')).toBe('CONUS');
  });

  it('returns FLDK for Himawari', () => {
    expect(getDefaultSector('Himawari-9')).toBe('FLDK');
  });
});
