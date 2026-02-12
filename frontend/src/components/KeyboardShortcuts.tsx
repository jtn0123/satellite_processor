import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHotkeys } from '../hooks/useHotkeys';
import { X, Keyboard } from 'lucide-react';

const shortcutList = [
  { keys: 'g d', label: 'Go to Dashboard' },
  { keys: 'g u', label: 'Go to Upload' },
  { keys: 'g p', label: 'Go to Process' },
  { keys: 'g j', label: 'Go to Jobs' },
  { keys: 'g s', label: 'Go to Settings' },
  { keys: 'g f', label: 'Go to GOES Data' },
  { keys: '?', label: 'Show shortcuts' },
  { keys: 'Escape', label: 'Close modals' },
];

export default function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const close = useCallback(() => setOpen(false), []);

  const shortcuts = useMemo(
    () => ({
      'g d': () => navigate('/'),
      'g u': () => navigate('/upload'),
      'g p': () => navigate('/process'),
      'g j': () => navigate('/jobs'),
      'g s': () => navigate('/settings'),
      'g f': () => navigate('/goes'),
      '?': () => setOpen((v) => !v),
      Escape: close,
    }),
    [navigate, close]
  );

  useHotkeys(shortcuts);

  if (!open) return null;

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none border-none"
      onClick={close}
    >
      <div
        className="bg-space-850 border border-subtle rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button onClick={close} className="p-1 hover:bg-space-700 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-2">
          {shortcutList.map((s) => (
            <div key={s.keys} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-slate-300">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.split(' ').map((k, i) => (
                  <kbd
                    key={i}
                    className="px-2 py-0.5 bg-space-700 border border-space-600 rounded text-xs font-mono text-slate-300"
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
