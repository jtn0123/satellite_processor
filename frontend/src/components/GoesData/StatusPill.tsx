import { timeAgo } from './liveTabUtils';

interface StatusPillProps {
  monitoring: boolean;
  satellite: string;
  band: string;
  frameTime: string | null;
  isMobile?: boolean;
}

export default function StatusPill({
  monitoring,
  satellite,
  band,
  frameTime,
  isMobile,
}: Readonly<StatusPillProps>) {
  const age = frameTime ? timeAgo(frameTime) : '';

  return (
    <div
      className={`absolute z-10 glass-t2 rounded-xl transition-all duration-300 ${
        monitoring ? 'status-badge-glow' : ''
      } ${isMobile ? 'top-2 left-2' : 'top-16 left-4'}`}
      data-testid="status-pill"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${
            monitoring ? 'bg-emerald-400 animate-soft-pulse' : 'bg-emerald-400/50'
          }`}
        />
        <span aria-live="polite" className="sr-only">
          {monitoring ? 'Monitor mode active' : 'Live mode'}
        </span>
        <div className="flex flex-col" aria-hidden="true">
          <span className="text-xs font-semibold text-white/90 tracking-wide">
            {monitoring ? 'MONITORING' : 'LIVE'}
            {satellite && <span className="font-normal text-white/60"> · {satellite}</span>}
            {band && <span className="font-normal text-white/60"> · {band}</span>}
          </span>
          {age && <span className="font-mono text-[10px] text-white/50">{age}</span>}
        </div>
      </div>
    </div>
  );
}
