/**
 * Build a WebSocket URL for the given path.
 *
 * The API key is NOT included in the URL — it is sent as the first message
 * after connection to avoid exposing credentials in browser dev tools,
 * server logs, and proxy access logs.
 */
export function buildWsUrl(path: string): string {
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${globalThis.location.host}${path}`;
}

/**
 * Return the configured API key (if any) for WebSocket first-message auth.
 */
export function getWsApiKey(): string {
  return import.meta.env.VITE_API_KEY ?? '';
}
