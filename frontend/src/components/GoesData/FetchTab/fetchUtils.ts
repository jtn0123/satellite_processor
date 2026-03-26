import type { SatelliteAvailability } from '../types';

export function formatAvailRange(avail: SatelliteAvailability): string {
  const from = new Date(avail.available_from);
  const fromStr = from
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    .replace(',', '');
  if (!avail.available_to) return `${fromStr}–present`;
  const to = new Date(avail.available_to);
  const toStr = to
    .toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    .replace(',', '');
  return `${fromStr}–${toStr}`;
}

export function isDateInRange(dateStr: string, avail: SatelliteAvailability): boolean {
  if (!dateStr) return true;
  const d = new Date(dateStr).getTime();
  const from = new Date(avail.available_from).getTime();
  if (d < from) return false;
  if (avail.available_to && d > new Date(avail.available_to).getTime()) return false;
  return true;
}
