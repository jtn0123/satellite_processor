export interface ToastMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
}

const listeners = new Set<(toast: ToastMessage) => void>();

export function showToast(type: ToastMessage['type'], message: string) {
  const toast: ToastMessage = { id: crypto.randomUUID(), type, message };
  listeners.forEach((fn) => fn(toast));
}

export function subscribeToast(fn: (toast: ToastMessage) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
