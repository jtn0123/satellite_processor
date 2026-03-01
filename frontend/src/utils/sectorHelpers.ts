/** Returns true if the sector is a mesoscale sector (no CDN images available). */
export function isMesoSector(sector: string): boolean {
  return sector === 'Mesoscale1' || sector === 'Mesoscale2';
}

/** Returns true if GEOCOLOR is available for the given sector (CDN-only: CONUS + FullDisk). */
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

/** Build a direct CDN URL from satellite/sector/band (returns null for meso sectors). */
export function buildCdnUrl(satellite: string, sector: string, band: string, isMobile = false): string | null {
  if (!satellite || !sector || !band) return null;
  if (!CDN_SECTOR_PATH[sector]) return null;
  const satPath = satellite.replaceAll('-', '');
  const cdnSector = CDN_SECTOR_PATH[sector];
  if (!cdnSector) return null;
  let cdnBand = band;
  if (band === 'GEOCOLOR') cdnBand = 'GEOCOLOR';
  else if (band.startsWith('C')) cdnBand = band.slice(1);
  const resolutions = CDN_RESOLUTIONS[sector] ?? CDN_RESOLUTIONS.CONUS;
  const resolution = isMobile ? resolutions.mobile : resolutions.desktop;
  return `https://cdn.star.nesdis.noaa.gov/${satPath}/ABI/${cdnSector}/${cdnBand}/${resolution}.jpg`;
}
