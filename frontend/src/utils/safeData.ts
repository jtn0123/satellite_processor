/**
 * Defensive data extraction utilities for API responses.
 * 
 * API responses may return:
 * - A raw array: [...]
 * - A paginated object: { items: [...], total: N, ... }
 * - An error object: { detail: "..." }
 * - undefined/null
 * 
 * These helpers ensure we always get a safe array to .map() over.
 */

/**
 * Extract an array from an API response that might be:
 * - An array directly
 * - An object with an `items` property
 * - null/undefined
 */
export function extractArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object' && 'items' in data) {
    const items = (data as Record<string, unknown>).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

/**
 * Safely get a numeric value, defaulting to 0.
 */
export function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  return fallback;
}

/**
 * Safe Math.max that handles empty arrays (which return -Infinity).
 */
export function safeMax(...values: number[]): number {
  if (values.length === 0) return 0;
  const result = Math.max(...values);
  return Number.isFinite(result) ? result : 0;
}
