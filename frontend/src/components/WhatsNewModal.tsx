import { useCallback } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';

const CHANGELOG = [
  {
    version: '2.3.0',
    date: '2026-02-16',
    changes: [
      'Defensive coding: 18 components hardened against unexpected API responses',
      'Accessibility: native <dialog> modals, <fieldset> groups, keyboard navigation',
      'Browse tab crash fix (paginated response handling)',
      'Null frame_count UI bug fixed',
      'SonarQube: 100 code quality issues resolved',
      'Frontend test suite: 352 → 481 tests',
      '8 dependency upgrades including security fix (python-multipart CVE)',
      'Readonly props, globalThis, nested ternary cleanups',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-02-15',
    changes: [
      'Configurable frame fetch cap (default 200, adjustable in Settings)',
      'New completed_partial status for capped or partially failed fetches',
      'Per-frame S3 retry with circuit breaker for transient errors',
      'Dashboard: empty states instead of stuck skeletons',
      'Dark mode contrast improvements',
      'WebSocket graceful reconnect with exponential backoff',
      'SonarQube quality gate: 91.6% coverage on new code',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-02-13',
    changes: [
      'Dashboard: GOES satellite stats with storage breakdown',
      'Quick fetch buttons (Last Hour, 6h, 12h, 24h)',
      'Notification bell with unread badge',
      'Keyboard shortcut cheat sheet (?)',
      'Frame preview keyboard navigation (← →)',
      'Browse tab: export to CSV, bulk operations toolbar',
      'Settings: storage breakdown by satellite/band',
      'Tab grouping with section labels (Data/Tools/Manage)',
      'Mobile scroll-snap for GOES tabs',
      'System theme detection (prefers-color-scheme)',
      'What\'s New changelog modal',
      'Empty state onboarding for new users',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-01-15',
    changes: [
      'GOES Data manager with 10 tabs',
      'Animation Studio for timelapse creation',
      'Composites and Map overlay support',
      'Collection & tag management',
      'Crop presets and frame comparison',
    ],
  },
];

export default function WhatsNewModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useFocusTrap(close);

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
          {CHANGELOG.map((release) => (
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
