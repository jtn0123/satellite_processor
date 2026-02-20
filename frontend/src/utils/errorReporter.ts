/**
 * ErrorReporter — centralised error logging utility.
 * In development it logs to console; in production it could POST to an endpoint.
 */

export interface ErrorReport {
  message: string;
  stack?: string;
  context?: string;
  url?: string;
  timestamp: string;
}

export type ErrorSubscriber = (report: ErrorReport) => void;

const isDev = import.meta.env.DEV;
const subscribers = new Set<ErrorSubscriber>();
const errorLog: ErrorReport[] = [];

/** Subscribe to all reported errors. Returns an unsubscribe function. */
export function onError(fn: ErrorSubscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

/** Read-only snapshot of all errors captured this session. */
export function getErrorLog(): readonly ErrorReport[] {
  return errorLog;
}

/** Clear the error log. */
export function clearErrorLog(): void {
  errorLog.length = 0;
}

function buildReport(error: unknown, context?: string): ErrorReport {
  const report: ErrorReport = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    url: globalThis.location?.href,
    timestamp: new Date().toISOString(),
  };
  return report;
}

export function reportError(error: unknown, context?: string): void {
  const report = buildReport(error, context);
  errorLog.push(report);

  if (isDev) {
    console.error(`[ErrorReporter] ${report.context ?? 'unknown'}:`, report.message, report.stack ?? '');
  } else {
    // In production, POST to an error reporting endpoint (if configured)
    const endpoint = import.meta.env.VITE_ERROR_ENDPOINT as string | undefined;
    if (endpoint) {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      }).catch(() => {
        // Swallow — we can't report errors about error reporting
      });
    } else {
      console.error(`[ErrorReporter] ${report.context ?? 'unknown'}:`, report.message);
    }
  }

  // Notify subscribers
  subscribers.forEach((fn) => {
    try { fn(report); } catch { /* subscriber errors must not cascade */ }
  });
}

export default reportError;
