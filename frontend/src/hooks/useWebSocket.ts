import { useEffect, useRef, useState, useCallback } from 'react';

interface JobProgress {
  progress: number;
  message: string;
  status?: string;
}

export function useWebSocket(jobId: string | null) {
  const [data, setData] = useState<JobProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!jobId) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/jobs/${jobId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        setData(JSON.parse(event.data));
      } catch { /* ignore */ }
    };

    return () => {
      ws.close();
      setConnected(false);
    };
  }, [jobId]);

  useEffect(() => {
    const cleanup = connect();
    return () => cleanup?.();
  }, [connect]);

  return { data, connected };
}
