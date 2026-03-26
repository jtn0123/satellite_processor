/** Returns true if the satellite is a Himawari satellite. */
export function isHimawariSatellite(satellite: string): boolean {
  const s = satellite.toLowerCase();
  return s.startsWith('himawari') || s === 'h9' || s === 'h8';
}

/** Returns true if the sector is a mesoscale sector (GOES: no CDN images available). */
export function isMesoSector(sector: string): boolean {
  return sector === 'Mesoscale1' || sector === 'Mesoscale2';
}

/** Returns true if the sector is a "regional" sector for the given satellite.
 *  GOES: Meso1/Meso2. Himawari: Japan/Target. */
export function isRegionalSector(satellite: string, sector: string): boolean {
  if (isHimawariSatellite(satellite)) {
    return sector === 'Japan' || sector === 'Target';
  }
  return isMesoSector(sector);
}

/** Returns true if the composite band (GEOCOLOR or TrueColor) is available for the given satellite/sector. */
export function isCompositeBandAvailable(satellite: string, sector: string): boolean {
  if (isHimawariSatellite(satellite)) {
    // TrueColor is available for all Himawari sectors
    return true;
  }
  // GOES: GEOCOLOR not available for mesoscale sectors
  return !isMesoSector(sector);
}

/** @deprecated Use isCompositeBandAvailable instead. Kept for backward compatibility. */
export function isGeocolorAvailable(sector: string): boolean {
  return !isMesoSector(sector);
}

/** CDN sector path mapping — CDN-available sectors only. */
const CDN_SECTOR_PATH: Readonly<Record<string, string>> = {
  CONUS: 'CONUS',
  FullDisk: 'FD',
};

/** CDN resolutions per sector. */
const CDN_RESOLUTIONS: Readonly<Record<string, { desktop: string; mobile: string }>> = {
  CONUS: { desktop: '2500x1500', mobile: '1250x750' },
  FullDisk: { desktop: '1808x1808', mobile: '1808x1808' },
};

/** Build a direct CDN URL from satellite/sector/band (returns null for meso sectors and Himawari). */
export function buildCdnUrl(
  satellite: string,
  sector: string,
  band: string,
  isMobile = false,
): string | null {
  if (!satellite || !sector || !band) return null;
  // No CDN exists for Himawari satellites
  if (isHimawariSatellite(satellite)) return null;
  const cdnSector = CDN_SECTOR_PATH[sector];
  if (!cdnSector) return null;
  const satPath = satellite.replaceAll('-', '');
  let cdnBand = band;
  if (band === 'GEOCOLOR') cdnBand = 'GEOCOLOR';
  else if (band.startsWith('C')) cdnBand = band.slice(1);
  const resolutions = CDN_RESOLUTIONS[sector] ?? CDN_RESOLUTIONS.CONUS;
  const resolution = isMobile ? resolutions.mobile : resolutions.desktop;
  return `https://cdn.star.nesdis.noaa.gov/${satPath}/ABI/${cdnSector}/${cdnBand}/${resolution}.jpg`;
}

/** Get the default composite band for a satellite. */
export function getDefaultBand(satellite: string): string {
  return isHimawariSatellite(satellite) ? 'TrueColor' : 'GEOCOLOR';
}

/** Get the default sector for a satellite. */
export function getDefaultSector(satellite: string): string {
  return isHimawariSatellite(satellite) ? 'FLDK' : 'CONUS';
}
