/**
 * Formatting utilities for display values.
 */

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format a duration in seconds to a human-readable string.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Truncate a string with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Human-readable label for an image-type enum. Used across the Confirm
 * modal, job list, and preset cards so a single value renders
 * consistently (see JTN-434 ISSUE-023).
 */
export function formatImageType(
  imageType: 'single' | 'true_color' | 'natural_color' | string,
  band?: string,
): string {
  if (imageType === 'single') return band ? `Single Band (${band})` : 'Single Band';
  if (imageType === 'true_color') return 'True Color';
  if (imageType === 'natural_color') return 'Natural Color';
  // Fallback for unexpected values: title-case whatever was passed.
  return imageType
    .split(/[_\s]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * Human-readable label for a Celery job_type identifier (e.g.
 * `goes_fetch_composite` → "GOES Fetch Composite"). Keeps mixed casing
 * for known acronyms (GOES, CONUS). See JTN-434 ISSUE-023.
 */
export function formatJobType(jobType: string): string {
  if (!jobType) return 'Unknown job';
  const ACRONYMS = new Set(['goes', 'conus', 'himawari', 'hsd', 'cdn', 'api', 'ws']);
  return jobType
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Human-readable label for a GOES sector id. Matches the product-panel
 * display names (e.g. `FullDisk` → "Full Disk"). See JTN-434.
 */
export function formatSectorName(sector: string): string {
  if (!sector) return sector;
  if (sector === 'FullDisk') return 'Full Disk';
  if (sector === 'Mesoscale1') return 'Mesoscale 1';
  if (sector === 'Mesoscale2') return 'Mesoscale 2';
  return sector;
}
