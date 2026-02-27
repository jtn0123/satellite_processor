import { timeAgo } from './liveTabUtils';

interface StatusPillProps {
  monitoring: boolean;
  satellite: string;
  band: string;
  frameTime: string | null;
  isMobile?: boolean;
}

export default function StatusPill({ monitoring, satellite, band, frameTime, isMobile }: Readonly<StatusPillProps>) {
  const dotClass = monitoring ? 'bg-emerald-400' : 'bg-emerald-400/50';
  const age = frameTime ? timeAgo(frameTime) : '';
  return (
    <div className={`absolute z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full backdrop-blur-sm ${isMobile ? 'top-2 left-2 bg-black/60' : 'top-16 left-4 bg-black/50'}`} data-testid="status-pill">
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass} animate-pulse`} />
      <span aria-live="polite" className="sr-only">
        {monitoring ? 'Monitor mode active' : 'Live mode'}
      </span>
      <span className="text-xs font-medium text-white/90" aria-hidden="true">
        {monitoring ? 'MONITORING' : 'LIVE'}
        {satellite && <> · {satellite}</>}
        {band && <> · {band}</>}
        {age && <> · {age}</>}
      </span>
    </div>
  );
}
