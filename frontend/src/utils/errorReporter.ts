/**
 * ErrorReporter — centralised error logging utility.
 * In development it logs to console; in production it could POST to an endpoint.
 */

interface ErrorReport {
  message: string;
  stack?: string;
  context?: string;
  url?: string;
  timestamp: string;
}

const isDev = import.meta.env.DEV;

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

  if (isDev) {
    console.error(`[ErrorReporter] ${report.context ?? 'unknown'}:`, report.message, report.stack ?? '');
    return;
  }

  // In production, POST to an error reporting endpoint (if configured)
  const endpoint = import.meta.env.VITE_ERROR_ENDPOINT;
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

export default reportError;
