import { useSyncExternalStore } from 'react';

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
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    ws = new WebSocket(`${protocol}//${globalThis.location.host}/ws/status`);
    ws.onopen = () => setStatus('connected');
    ws.onclose = () => {
      ws = null;
      if (refCount > 0) {
        setStatus('reconnecting');
        timer = setTimeout(connect, 5000);
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

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
      <span className={`w-2 h-2 rounded-full ${cfg.color} ${status === 'reconnecting' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </div>
  );
}
