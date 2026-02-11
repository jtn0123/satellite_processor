import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { type ToastMessage, subscribeToast } from '../utils/toast';

let toasts: ToastMessage[] = [];
const toastListeners = new Set<() => void>();

function notifyToastListeners() {
  toastListeners.forEach((fn) => fn());
}

function addToast(toast: ToastMessage) {
  toasts = [...toasts, toast];
  notifyToastListeners();
  setTimeout(() => {
    removeToast(toast.id);
  }, 5000);
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notifyToastListeners();
}

function getToasts() {
  return toasts;
}

function subscribeToasts(cb: () => void) {
  toastListeners.add(cb);
  return () => { toastListeners.delete(cb); };
}

export default function ToastContainer() {
  const currentToasts = useSyncExternalStore(subscribeToasts, getToasts);

  useEffect(() => subscribeToast(addToast), []);

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);

  if (currentToasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
      {currentToasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm animate-slide-in ${
            t.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-300'
              : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }`}
          role="status"
        >
          {t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="p-0.5 hover:opacity-70">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
