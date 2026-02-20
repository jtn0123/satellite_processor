import { useEffect, useRef, useState } from 'react';
import { buildWsUrl } from '../api/ws';
import { showToast } from '../utils/toast';
import { reportError } from '../utils/errorReporter';

export interface FrameIngestEvent {
  type: 'frame_ingested';
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  timestamp: string;
}

const RECONNECT_BASE_DELAY = 5000;
const RECONNECT_MAX_DELAY = 60000;
const RECONNECT_MAX_RETRIES = 20;

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
    let retryCount = 0;

    function openConnection() {
      if (disposed) return;

      ws = new WebSocket(buildWsUrl('/ws/events'));

      ws.onopen = () => {
        if (!disposed) {
          setConnected(true);
          retryCount = 0; // Reset on successful connection
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          setConnected(false);
          ws = null;
          if (enabledRef.current && retryCount < RECONNECT_MAX_RETRIES) {
            const delay = Math.min(
              RECONNECT_BASE_DELAY * Math.pow(2, retryCount),
              RECONNECT_MAX_DELAY,
            );
            retryCount++;
            timer = setTimeout(openConnection, delay);
          }
        }
      };

      ws.onerror = () => {
        reportError(new Error('Monitor WebSocket error'), 'useMonitorWebSocket.onerror');
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
          } else if (parsed.type === 'job_completed') {
            // A job completed — trigger refetch to pick up new frames
            setLastEvent({
              type: 'frame_ingested',
              satellite: '',
              sector: '',
              band: '',
              capture_time: new Date().toISOString(),
              timestamp: new Date().toISOString(),
            });
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
