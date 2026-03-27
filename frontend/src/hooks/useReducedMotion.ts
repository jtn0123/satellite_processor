import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia(query);
  mq.addEventListener('change', callback);
  return () => mq.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(query).matches;
}

/** Returns true if the user prefers reduced motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
