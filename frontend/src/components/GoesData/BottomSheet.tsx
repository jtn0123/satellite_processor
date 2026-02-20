import { useRef, useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Mobile-friendly bottom sheet component.
 * Slides up from the bottom with drag-to-dismiss.
 */
export default function BottomSheet({ open, onClose, title, children }: Readonly<BottomSheetProps>) {
  const sheetRef = useRef<HTMLDialogElement>(null);
  const [translateY, setTranslateY] = useState(0);
  const dragStart = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    if (dy > 0) setTranslateY(dy);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (translateY > 100) {
      onClose();
    }
    setTranslateY(0);
    dragStart.current = null;
  }, [translateY, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { onClose(); }
      };
      document.addEventListener('keydown', handler);
      return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', handler); };
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Sheet */}
      <dialog
        open
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-2xl max-h-[80vh] overflow-y-auto shadow-xl transition-transform border-none p-0 m-0 w-full"
        style={{ transform: `translateY(${translateY}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        aria-label={title}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-200 dark:border-slate-800">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {children}
        </div>
      </dialog>
    </div>
  );
}
