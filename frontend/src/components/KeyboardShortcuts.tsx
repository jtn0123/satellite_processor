import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from '../hooks/useHotkeys';
import { X, Keyboard } from 'lucide-react';

// JTN-434: three rows of this list used to all read "Go to Settings",
// making the dialog useless. Each row now describes its real destination.
const shortcutList = [
  { keys: 'g d', label: 'Go to Dashboard' },
  { keys: 'g l', label: 'Go to Live' },
  { keys: 'g b', label: 'Go to Browse & Fetch' },
  { keys: 'g a', label: 'Go to Animate' },
  { keys: 'g j', label: 'Go to Jobs' },
  { keys: 'g s', label: 'Go to Settings' },
  { keys: '?', label: 'Show shortcuts' },
  { keys: 'Escape', label: 'Close any open modal' },
  { keys: '← →', label: 'Navigate frames in preview' },
  { keys: '1-0', label: 'Switch Satellite Data tabs' },
  { keys: 'Space', label: 'Play/pause animation preview' },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    globalThis.addEventListener('toggle-keyboard-shortcuts', handler);
    return () => globalThis.removeEventListener('toggle-keyboard-shortcuts', handler);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  // Global Escape handler that dispatches custom event for modals
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Dispatch custom event so modals can listen
        globalThis.dispatchEvent(new CustomEvent('close-modal'));
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const shortcuts = useMemo(
    () => ({
      'g d': () => navigate('/'),
      'g l': () => navigate('/live'),
      'g b': () => navigate('/goes'),
      'g a': () => navigate('/animate'),
      'g j': () => navigate('/jobs'),
      'g s': () => navigate('/settings'),
      '?': () => setOpen((v) => !v),
      Escape: close,
    }),
    [navigate, close],
  );

  useHotkeys(shortcuts);

  if (!open) return null;

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      onCancel={close}
      aria-label="Keyboard shortcuts dialog"
    >
      <button
        className="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        onClick={close}
        aria-label="Close dialog"
        tabIndex={-1}
      />
      <div className="relative card-elevated rounded-2xl p-6 w-full max-w-md text-left cursor-default modal-panel">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="p-1 hover:bg-gray-100 dark:hover:bg-space-700 rounded-lg text-gray-500 dark:text-slate-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcutList.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-gray-600 dark:text-slate-300">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.split(' ').map((k) => (
                  <kbd
                    key={k}
                    className="px-2 py-0.5 bg-gray-100 dark:bg-space-700 border border-gray-300 dark:border-space-600 rounded text-xs font-mono text-gray-600 dark:text-slate-300"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
