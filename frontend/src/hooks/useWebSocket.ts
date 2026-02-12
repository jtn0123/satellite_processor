import { useEffect, useRef, useState, useCallback } from 'react';

interface JobProgress {
  progress: number;
  message: string;
  status?: string;
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRIES = 10;

export function useWebSocket(jobId: string | null, maxRetries = DEFAULT_MAX_RETRIES) {
  const [data, setData] = useState<JobProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!jobId || terminalRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      retriesRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      // Don't reconnect if terminal or max retries exceeded
      if (terminalRef.current || retriesRef.current >= maxRetries) {
        setReconnecting(false);
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
      const delay = Math.min(1000 * 2 ** retriesRef.current, MAX_BACKOFF_MS);
      retriesRef.current += 1;
      setReconnecting(true);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        connectRef.current();
      }, delay);
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        setData(parsed);

        // Stop reconnecting if job reached terminal state
        if (parsed.status && TERMINAL_STATES.has(parsed.status)) {
          terminalRef.current = true;
        }
      } catch (err) { console.error('Failed to parse WebSocket message:', err); }
    };
  }, [jobId, maxRetries]);

  // Keep ref in sync with latest connect
  useEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    terminalRef.current = false;
    retriesRef.current = 0;
    connect();

    return () => {
      clearTimer();
      terminalRef.current = true; // prevent reconnect during cleanup
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setReconnecting(false);
    };
  }, [connect, clearTimer]);

  return { data, connected, reconnecting };
}
