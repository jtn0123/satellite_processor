import { useEffect, useRef, useState, useCallback } from 'react';
import { buildWsUrl } from '../api/ws';
import { showToast } from '../utils/toast';

export interface FrameIngestEvent {
  type: 'frame_ingested';
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  timestamp: string;
}

const RECONNECT_DELAY = 5000;

/**
 * Connects to /ws/frames for real-time frame ingestion notifications.
 * Shows a toast when new frames matching the current config arrive.
 */
export function useMonitorWebSocket(
  enabled: boolean,
  filter?: { satellite?: string; sector?: string; band?: string },
) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<FrameIngestEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    cleanup();

    const ws = new WebSocket(buildWsUrl('/ws/frames'));
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (enabledRef.current) {
        timerRef.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === 'frame_ingested') {
          const f = filterRef.current;
          const matches =
            (!f?.satellite || f.satellite === parsed.satellite) &&
            (!f?.sector || f.sector === parsed.sector) &&
            (!f?.band || f.band === parsed.band);
          if (matches) {
            setLastEvent(parsed as FrameIngestEvent);
            showToast(
              'info',
              `New frame: ${parsed.satellite} ${parsed.sector} ${parsed.band}`,
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    };
  }, [cleanup]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
    }
    return cleanup;
  }, [enabled, connect, cleanup]);

  return { connected, lastEvent };
}
