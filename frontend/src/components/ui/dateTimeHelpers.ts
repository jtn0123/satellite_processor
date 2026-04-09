/**
 * Helpers for populating `<input type="datetime-local">` controls with
 * sensible defaults. Kept in a separate module from `DateTimeField.tsx`
 * so React Fast Refresh can hot-reload the component cleanly.
 */

/**
 * Returns the given date (default: now) formatted for a
 * `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`).
 *
 * Use this as a non-empty default so the native spinbutton sub-fields
 * don't start at Month=0, Year=0, ... (see JTN-422).
 */
export function nowForDateTimeLocal(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/**
 * Returns a default `[start, end]` range centered on "now":
 * `start = now − hoursBack`, `end = now`.
 */
export function defaultDateTimeRange(
  hoursBack = 1,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  return {
    start: nowForDateTimeLocal(start),
    end: nowForDateTimeLocal(now),
  };
}
