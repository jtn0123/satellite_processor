import { useCallback, useEffect, useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Release {
  version: string;
  date: string;
  changes: string[];
}

export default function WhatsNewModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useFocusTrap(close);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health/changelog')
      .then((r) => r.json())
      .then((data: Release[]) => {
        if (!cancelled) setReleases(data);
      })
      .catch(() => {
        /* fallback to empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      role="presentation"
      onClick={close}
      onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
      aria-label="What's New dialog"
    >
      <div
        ref={dialogRef}
        className="bg-white dark:bg-space-850 border border-gray-200 dark:border-space-700/50 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">What&apos;s New</h2>
          </div>
          <button onClick={close} className="p-1 hover:bg-gray-100 dark:hover:bg-space-700 rounded-lg text-gray-500 dark:text-slate-400" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-6">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" aria-label="Loading changelog" />
            </div>
          )}
          {!loading && releases.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4">No changelog entries available.</p>
          )}
          {releases.map((release) => (
            <div key={release.version}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-primary">v{release.version}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{release.date}</span>
              </div>
              <ul className="space-y-1">
                {release.changes.map((change) => (
                  <li key={change} className="text-sm text-gray-600 dark:text-slate-300 flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </dialog>
  );
}
