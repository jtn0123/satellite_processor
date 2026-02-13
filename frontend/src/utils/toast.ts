export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

const listeners = new Set<(toast: ToastMessage) => void>();

export function showToast(type: ToastType, message: string) {
  const toast: ToastMessage = { id: crypto.randomUUID(), type, message, createdAt: Date.now() };
  listeners.forEach((fn) => fn(toast));
}

export function subscribeToast(fn: (toast: ToastMessage) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
