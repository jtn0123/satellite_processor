/**
 * ErrorReporter — centralised error logging utility.
 * In development it logs to console; in production it POSTs to /api/errors
 * with debouncing/batching to avoid flooding.
 */

export interface ErrorReport {
  message: string;
  stack?: string;
  context?: string;
  url?: string;
  timestamp: string;
  userAgent?: string;
}

export type ErrorSubscriber = (report: ErrorReport) => void;

const isDev = import.meta.env.DEV;
const isProd = import.meta.env.PROD;
const subscribers = new Set<ErrorSubscriber>();
const errorLog: ErrorReport[] = [];

// --- Production batching ---
const ERROR_QUEUE: ErrorReport[] = [];
const MAX_QUEUE = 10;
const FLUSH_INTERVAL_MS = 5000;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getApiKey(): string {
  return import.meta.env.VITE_API_KEY ?? '';
}

function flushErrors(): void {
  if (ERROR_QUEUE.length === 0) return;
  const batch = ERROR_QUEUE.splice(0, MAX_QUEUE);
  const apiKey = getApiKey();

  for (const report of batch) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    fetch('/api/errors', {
      method: 'POST',
      headers,
      body: JSON.stringify(report),
    }).catch(() => {
      // Swallow — can't report errors about error reporting
    });
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushErrors();
  }, FLUSH_INTERVAL_MS);
}

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
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    url: globalThis.location?.href,
    timestamp: new Date().toISOString(),
    userAgent: globalThis.navigator?.userAgent,
  };
}

export function reportError(error: unknown, context?: string): void {
  const report = buildReport(error, context);
  errorLog.push(report);

  if (isDev) {
    console.error(`[ErrorReporter] ${report.context ?? 'unknown'}:`, report.message, report.stack ?? '');
  }

  if (isProd) {
    // Queue and debounce
    if (ERROR_QUEUE.length < MAX_QUEUE) {
      ERROR_QUEUE.push(report);
    }
    scheduleFlush();
  }

  // Notify subscribers
  subscribers.forEach((fn) => {
    try { fn(report); } catch { /* subscriber errors must not cascade */ }
  });
}

export default reportError;
