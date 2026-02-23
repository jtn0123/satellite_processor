import { useState, useSyncExternalStore } from 'react';
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
    if (refCount > 0 && retryCount < MAX_RETRIES) {
      retryCount++;
      setStatus('reconnecting');
      const delay = Math.min(5000 * 2 ** (retryCount - 1), 30000);
      timer = setTimeout(connect, delay);
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
      retryCount = 0;
    }
  };
}

function getSnapshot() {
  return currentStatus;
}

export default function ConnectionStatus() {
  const status = useSyncExternalStore(subscribe, getSnapshot);
  const [hasConnected, setHasConnected] = useState(false);
  const cfg = statusConfig[status];

  if (status === 'connected' && !hasConnected) {
    setHasConnected(true);
  }

  // Before first successful connection, hide disconnected state
  if (status === 'disconnected' && !hasConnected) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-400">
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.color} ${status === 'reconnecting' ? 'animate-pulse' : ''}`} />
      {status === 'disconnected' ? 'Offline' : cfg.label}
    </div>
  );
}
