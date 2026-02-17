import { useCallback, useEffect, useState } from 'react';
import { X, Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface Release {
  version: string;
  date: string;
  changes: string[];
}

interface WhatsNewModalProps {
  onClose: () => void;
  version?: string;
  commit?: string;
}

const GITHUB_RELEASES_BASE = 'https://github.com/jtn0123/satellite_processor/releases/tag';

export default function WhatsNewModal({ onClose, version, commit }: Readonly<WhatsNewModalProps>) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useFocusTrap(close);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health/changelog')
      .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then((data: Release[]) => {
        if (!cancelled && Array.isArray(data)) setReleases(data);
      })
      .catch(() => {
        /* fallback to empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const headerText = version ? `What's New — v${version}` : "What's New";
  const commitSha = commit && commit !== 'dev' ? commit.slice(0, 7) : null;

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      role="presentation"
      onClick={close}
      onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-label="What's New dialog"
        className="bg-white dark:bg-space-850 border border-gray-200 dark:border-space-700/50 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto modal-panel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">{headerText}</h2>
              {commitSha && (
                <span className="text-xs text-gray-400 dark:text-slate-500">{commitSha}</span>
              )}
            </div>
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
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-primary">v{release.version}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">{release.date}</span>
              </div>
              <a
                href={`${GITHUB_RELEASES_BASE}/v${release.version}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors mb-2"
              >
                View on GitHub <ExternalLink className="w-3 h-3" />
              </a>
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
