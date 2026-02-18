import { useEffect, useRef, useState } from 'react';
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
  const filterRef = useRef(filter);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function openConnection() {
      if (disposed) return;

      ws = new WebSocket(buildWsUrl('/ws/frames'));

      ws.onopen = () => {
        if (!disposed) setConnected(true);
      };

      ws.onclose = () => {
        if (!disposed) {
          setConnected(false);
          ws = null;
          if (enabledRef.current) {
            timer = setTimeout(openConnection, RECONNECT_DELAY);
          }
        }
      };

      ws.onerror = () => {
        ws?.close();
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
    }

    openConnection();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (ws) ws.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected, lastEvent };
}
