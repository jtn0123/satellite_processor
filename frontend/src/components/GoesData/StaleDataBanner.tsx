import { Clock, AlertTriangle, Download } from 'lucide-react';

interface StaleDataBannerProps {
  freshnessInfo: { awsAge: string; localAge: string; behindMin: number };
  captureTime: string;
  activeJobId: string | null;
  onFetchNow: () => void;
}

type StaleLevel = 'green' | 'amber' | 'red';

const COLORS: Record<StaleLevel, string> = {
  green: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300',
  red: 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-300',
};

function getStaleLevel(captureTime: string): StaleLevel {
  const localMs = Date.now() - new Date(captureTime).getTime();
  if (localMs > 7200000) return 'red';
  if (localMs > 1800000) return 'amber';
  return 'green';
}

export default function StaleDataBanner({ freshnessInfo, captureTime, activeJobId, onFetchNow }: Readonly<StaleDataBannerProps>) {
  const staleLevel = getStaleLevel(captureTime);

  if (staleLevel === 'green' && freshnessInfo.behindMin <= 0) {
    return null;
  }

  return (
    <div className={`${COLORS[staleLevel]} border rounded-xl px-6 py-3 flex items-center gap-3`}>
      {staleLevel === 'red'
        ? <AlertTriangle className="w-4 h-4 shrink-0" />
        : <Clock className="w-4 h-4 shrink-0" />}
      <span className="text-sm flex-1">
        {staleLevel === 'red' && <strong>Data is stale! </strong>}
        {freshnessInfo.behindMin > 0
          ? <>AWS has a frame from <strong>{freshnessInfo.awsAge}</strong>, your latest is <strong>{freshnessInfo.localAge}</strong> ({freshnessInfo.behindMin} min behind)</>
          : <>Your latest frame is <strong>{freshnessInfo.localAge}</strong></>}
      </span>
      <button
        onClick={onFetchNow}
        disabled={!!activeJobId}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      >
        <Download className="w-3.5 h-3.5" />
        Fetch Now
      </button>
    </div>
  );
}
