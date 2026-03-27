import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
  const mq = globalThis.matchMedia?.(query);
  if (!mq) return () => {};
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return globalThis.matchMedia?.(query)?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return false;
}

/** Returns true if the user prefers reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
