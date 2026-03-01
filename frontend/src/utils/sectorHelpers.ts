/** Returns true if the sector is a mesoscale sector (no CDN images available). */
export function isMesoSector(sector: string): boolean {
  return sector === 'Mesoscale1' || sector === 'Mesoscale2';
}
