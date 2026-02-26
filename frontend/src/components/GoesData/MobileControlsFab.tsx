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

export default function MobileControlsFab({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, autoFetchDisabled, autoFetchDisabledReason }: Readonly<MobileControlsFabProps>) {
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
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler); };
  }, [open]);

  return (
    <div ref={fabRef} className="relative">
      {open && (
        <div id="fab-menu" className="absolute bottom-14 right-0 flex flex-col gap-2 p-3 rounded-xl bg-black/70 backdrop-blur-md border border-white/20 min-w-[180px]" data-testid="fab-menu">
          <button
            onClick={() => { onToggleMonitor(); setOpen(false); }}
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
            onClick={() => onAutoFetchChange(!autoFetch)}
            title={autoFetchDisabled ? autoFetchDisabledReason : undefined}
            disabled={autoFetchDisabled}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
              autoFetchDisabled
                ? 'bg-white/10 border border-white/20 text-white/40 cursor-not-allowed'
                : autoFetch
                  ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                  : 'bg-white/10 border border-white/20 text-white/80'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            {autoFetchDisabled ? 'Auto-fetch N/A' : 'Auto-fetch'}
          </button>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex flex-col items-center justify-center text-white/80 hover:text-white hover:bg-black/80 transition-colors shadow-lg"
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
