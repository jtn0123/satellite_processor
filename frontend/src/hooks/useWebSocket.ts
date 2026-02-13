import { useEffect, useRef, useState, useCallback } from 'react';

interface JobProgress {
  progress: number;
  message: string;
  status?: string;
}

export interface JobLogEntry {
  level: string;
  message: string;
  timestamp: string;
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_MAX_RETRIES = 10;

export function useWebSocket(jobId: string | null, maxRetries = DEFAULT_MAX_RETRIES) {
  const [data, setData] = useState<JobProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const logsRef = useRef<JobLogEntry[]>([]);
  const [logs, setLogs] = useState<JobLogEntry[]>([]);
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

    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${globalThis.location.host}/ws/jobs/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      retriesRef.current = 0;
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;

      if (terminalRef.current || retriesRef.current >= maxRetries) {
        setReconnecting(false);
        return;
      }

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

        if (parsed.type === 'log') {
          const entry: JobLogEntry = {
            level: parsed.level ?? 'info',
            message: parsed.message ?? '',
            timestamp: parsed.timestamp ?? new Date().toISOString(),
          };
          logsRef.current = [...logsRef.current, entry];
          setLogs(logsRef.current);
          return;
        }

        if (parsed.type === 'progress') {
          setData(parsed);
        } else if (parsed.type !== 'ping' && parsed.type !== 'connected') {
          setData(parsed);
        }

        if (parsed.status && TERMINAL_STATES.has(parsed.status)) {
          terminalRef.current = true;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };
  }, [jobId, maxRetries]);

  useEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    terminalRef.current = false;
    retriesRef.current = 0;
    logsRef.current = [];
    connect();

    return () => {
      clearTimer();
      terminalRef.current = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setReconnecting(false);
    };
  }, [connect, clearTimer]);

  return { data, connected, reconnecting, logs };
}
