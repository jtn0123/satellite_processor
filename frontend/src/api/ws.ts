/**
 * Build a WebSocket URL with optional API key authentication.
 *
 * NOTE: The API key is passed as a query parameter here, which is visible in
 * browser dev tools and server logs. This is acceptable for local development
 * only. In production, Nginx injects the API key via header so VITE_API_KEY
 * is not set and the key never appears in the URL.
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
