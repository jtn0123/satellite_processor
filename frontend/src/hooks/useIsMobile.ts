import { useSyncExternalStore } from 'react';

function subscribeToResize(cb: () => void) {
  globalThis.addEventListener('resize', cb);
  return () => globalThis.removeEventListener('resize', cb);
}

function getIsMobile() {
  return globalThis.window !== undefined && globalThis.innerWidth < 768;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeToResize, getIsMobile, () => false);
}
