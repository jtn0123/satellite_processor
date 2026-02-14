/**
 * Build a WebSocket URL with optional API key authentication.
 */
export function buildWsUrl(path: string): string {
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${globalThis.location.host}${path}`;
  const apiKey = import.meta.env.VITE_API_KEY;
  if (apiKey) {
    const sep = path.includes('?') ? '&' : '?';
    return `${base}${sep}api_key=${encodeURIComponent(apiKey)}`;
  }
  return base;
}
