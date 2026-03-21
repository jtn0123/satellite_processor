import { AlertTriangle } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmDialogProps {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly variant?: 'danger' | 'warning';
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  isPending,
  onConfirm,
  onCancel,
  variant = 'danger',
}: ConfirmDialogProps) {
  const trapRef = useFocusTrap(onCancel);

  const isDanger = variant === 'danger';
  const iconBg = isDanger
    ? 'bg-red-100 dark:bg-red-500/10'
    : 'bg-amber-100 dark:bg-amber-500/10';
  const iconColor = isDanger ? 'text-red-500' : 'text-amber-500';
  const confirmBg = isDanger
    ? 'bg-red-600 hover:bg-red-500'
    : 'bg-amber-600 hover:bg-amber-500';

  return (
    <dialog
      open
      className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4 m-0 w-full h-full max-w-none max-h-none backdrop:bg-black/50"
      onCancel={onCancel}
      onClose={onCancel}
      aria-labelledby="confirm-dialog-title"
    >
      <button type="button" className="fixed inset-0 w-full h-full bg-transparent border-none cursor-default" onClick={onCancel} aria-label="Close dialog" tabIndex={-1} />
      <div ref={trapRef} className="relative bg-white dark:bg-slate-900 rounded-xl p-6 max-w-sm w-full space-y-4 border border-gray-200 dark:border-slate-700 mx-auto mt-[30vh]">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
            <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`flex-1 px-4 py-2 text-sm ${confirmBg} text-white rounded-lg disabled:opacity-50 transition-colors`}
          >
            {isPending ? `${confirmLabel}...` : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
