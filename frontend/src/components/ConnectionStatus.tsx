import { useSyncExternalStore } from 'react';
import { buildWsUrl } from '../api/ws';

type Status = 'connected' | 'reconnecting' | 'disconnected';

const statusConfig: Record<Status, { color: string; label: string }> = {
  connected: { color: 'bg-green-400', label: 'Connected' },
  reconnecting: { color: 'bg-yellow-400', label: 'Reconnecting' },
  disconnected: { color: 'bg-red-400', label: 'Disconnected' },
};

// External store for WebSocket connection status
let currentStatus: Status = 'disconnected';
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let timer: ReturnType<typeof setTimeout> | undefined = undefined;
let refCount = 0;
let retryCount = 0;
const MAX_RETRIES = 5;

function notify() {
  listeners.forEach((fn) => fn());
}

function setStatus(s: Status) {
  if (s !== currentStatus) {
    currentStatus = s;
    notify();
  }
}

function connect() {
  if (typeof WebSocket === 'undefined' || !globalThis.location?.host) {
    setStatus('disconnected');
    return;
  }
  try {
    ws = new WebSocket(buildWsUrl('/ws/status'));
    ws.onopen = () => {
      setStatus('connected');
      retryCount = 0;
    };
    ws.onclose = () => {
      ws = null;
      if (refCount > 0 && retryCount < MAX_RETRIES) {
        retryCount++;
        setStatus('reconnecting');
        const delay = Math.min(5000 * 2 ** (retryCount - 1), 30000);
        timer = setTimeout(connect, delay);
      } else {
        setStatus('disconnected');
      }
    };
    ws.onerror = () => ws?.close();
  } catch {
    setStatus('disconnected');
    if (refCount > 0) {
      timer = setTimeout(connect, 5000);
    }
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  refCount++;
  if (refCount === 1) connect();
  return () => {
    listeners.delete(cb);
    refCount--;
    if (refCount === 0) {
      if (timer !== undefined) clearTimeout(timer);
      ws?.close();
      ws = null;
      currentStatus = 'disconnected';
    }
  };
}

function getSnapshot() {
  return currentStatus;
}

export default function ConnectionStatus() {
  const status = useSyncExternalStore(subscribe, getSnapshot);
  const cfg = statusConfig[status];

  // Don't show persistent "Reconnecting" or "Disconnected" — only show when connected
  // This prevents the UI from showing a scary status when WS endpoint isn't available
  if (status === 'disconnected') return null;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
      <span className={`w-2 h-2 rounded-full ${cfg.color} ${status === 'reconnecting' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </div>
  );
}
