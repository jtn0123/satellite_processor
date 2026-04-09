import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Zap, SlidersHorizontal, X } from 'lucide-react';

interface MobileControlsFabProps {
  monitoring: boolean;
  onToggleMonitor: () => void;
  autoFetch: boolean;
  onAutoFetchChange: (v: boolean) => void;
  autoFetchDisabled?: boolean;
  autoFetchDisabledReason?: string;
}

function getAutoFetchButtonClass(autoFetch: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-white/10 border border-white/20 text-white/40 cursor-not-allowed';
  if (autoFetch) return 'bg-amber-500/20 border border-amber-400/40 text-amber-300';
  return 'bg-white/10 border border-white/20 text-white/80';
}

/** Short visible label for the auto-fetch button. */
function getAutoFetchText(autoFetch: boolean, disabled: boolean | undefined): string {
  if (disabled) return 'Auto-fetch unavailable';
  if (autoFetch) return 'Auto-fetch on';
  return 'Auto-fetch off';
}

/** Full-sentence accessible name for the auto-fetch button. */
function getAutoFetchAriaLabel(
  autoFetch: boolean,
  disabled: boolean | undefined,
  reason: string | undefined,
): string {
  if (disabled) return `Auto-fetch unavailable: ${reason ?? 'not supported for this view'}`;
  if (autoFetch) return 'Auto-fetch on — tap to turn off';
  return 'Auto-fetch off — tap to turn on';
}

export default function MobileControlsFab({
  monitoring,
  onToggleMonitor,
  autoFetch,
  onAutoFetchChange,
  autoFetchDisabled,
  autoFetchDisabledReason,
}: Readonly<MobileControlsFabProps>) {
  const [open, setOpen] = useState(false);
  const fabRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    const handler = (e: globalThis.MouseEvent | globalThis.TouchEvent) => {
      if (Date.now() - openedAt.current < 150) return;
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // JTN-428: surface real state ("Auto-fetch on/off/unavailable") instead
  // of a bare "Auto-fetch N/A". Labels/text are precomputed to avoid
  // nested ternaries (SonarCloud S3358).
  const autoFetchText = getAutoFetchText(autoFetch, autoFetchDisabled);
  const autoFetchLabel = getAutoFetchAriaLabel(
    autoFetch,
    autoFetchDisabled,
    autoFetchDisabledReason,
  );

  return (
    <div ref={fabRef} className="relative">
      {open && (
        <div
          id="fab-menu"
          className="absolute bottom-14 right-0 flex flex-col gap-2 p-3 rounded-xl glass-t3 min-w-[180px] animate-slide-up"
          data-testid="fab-menu"
        >
          <button
            type="button"
            onClick={() => {
              onToggleMonitor();
              setOpen(false);
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
              monitoring
                ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300'
                : 'bg-white/10 border border-white/20 text-white/80'
            }`}
          >
            {monitoring ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {monitoring ? 'Stop Watch' : 'Watch'}
          </button>
          <button
            type="button"
            onClick={autoFetchDisabled ? undefined : () => onAutoFetchChange(!autoFetch)}
            title={autoFetchDisabled ? autoFetchDisabledReason : undefined}
            aria-label={autoFetchLabel}
            disabled={autoFetchDisabled}
            className={`flex flex-col items-start px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${getAutoFetchButtonClass(autoFetch, autoFetchDisabled)}`}
          >
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              {autoFetchText}
            </span>
            {autoFetchDisabled && autoFetchDisabledReason && (
              <span className="text-[10px] text-white/40 leading-tight mt-0.5">
                {autoFetchDisabledReason}
              </span>
            )}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full glass-t2 flex flex-col items-center justify-center text-white/80 hover:text-white transition-all duration-150 hover:scale-105 active:scale-95"
        aria-label="Toggle controls"
        aria-expanded={open}
        aria-controls="fab-menu"
        data-testid="fab-toggle"
      >
        {open ? <X className="w-5 h-5" /> : <SlidersHorizontal className="w-5 h-5" />}
      </button>
    </div>
  );
}
