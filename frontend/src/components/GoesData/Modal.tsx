import { useEffect, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ModalProps {
  readonly onClose: () => void;
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly panelClassName?: string;
  readonly overlayClassName?: string;
}

export default function Modal({
  onClose,
  ariaLabel,
  children,
  panelClassName = 'bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700 w-96 space-y-4 modal-panel',
  overlayClassName = 'fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none',
}: ModalProps) {
  const dialogRef = useFocusTrap(onClose);

  useEffect(() => {
    const handler = () => onClose();
    globalThis.addEventListener('close-modal', handler);
    return () => globalThis.removeEventListener('close-modal', handler);
  }, [onClose]);

  return (
    <dialog open className={overlayClassName}>
      <button
        type="button"
        className="fixed inset-0 w-full h-full bg-transparent cursor-default"
        onClick={onClose}
        aria-label="Close modal"
      />
      <div
        ref={dialogRef}
        aria-label={ariaLabel}
        className={panelClassName}
        aria-hidden="false"
      >
        {children}
      </div>
    </dialog>
  );
}
