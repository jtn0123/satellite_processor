import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { type ToastMessage, type ToastType, subscribeToast } from '../utils/toast';

const TOAST_DURATION = 5000;

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
  }, TOAST_DURATION);
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

const styleMap: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-green-100 dark:bg-green-500/20 border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-300',
    icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
  },
  error: {
    bg: 'bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-300',
    icon: <XCircle className="w-4 h-4 shrink-0" />,
  },
  warning: {
    bg: 'bg-yellow-100 dark:bg-yellow-500/20 border-yellow-300 dark:border-yellow-500/30 text-yellow-700 dark:text-yellow-300',
    icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/30 text-blue-700 dark:text-blue-300',
    icon: <Info className="w-4 h-4 shrink-0" />,
  },
};

const progressBarColors: Record<ToastType, string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  warning: 'bg-yellow-400',
  info: 'bg-blue-400',
};

function ToastItem({ toast, onDismiss }: Readonly<{ toast: ToastMessage; onDismiss: (id: string) => void }>) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.width = '0%';
    });
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [onDismiss, toast.id]);

  const style = styleMap[toast.type];
  return (
    <output
      role="alert"
      aria-live="polite"
      className={`flex flex-col rounded-xl shadow-lg text-sm border overflow-hidden ${dismissing ? 'animate-slide-out' : 'animate-slide-in'} ${style.bg}`}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        {style.icon}
        <span className="flex-1">{toast.message}</span>
        <button onClick={handleDismiss} className="p-0.5 hover:opacity-70 transition-opacity" aria-label="Dismiss notification">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="h-0.5 w-full bg-black/20">
        <div
          ref={progressRef}
          className={`h-full ${progressBarColors[toast.type]} transition-[width] ease-linear`}
          style={{ width: '100%', transitionDuration: `${TOAST_DURATION}ms` }}
        />
      </div>
    </output>
  );
}

export default function ToastContainer() {
  const currentToasts = useSyncExternalStore(subscribeToasts, getToasts);

  useEffect(() => subscribeToast(addToast), []);

  const dismiss = useCallback((id: string) => {
    removeToast(id);
  }, []);

  if (currentToasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-4 right-4 z-100 space-y-2 max-w-sm">
      {currentToasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
