import { Eye, EyeOff, Zap, Columns2 } from 'lucide-react';
import { REFRESH_INTERVALS } from './liveTabUtils';

interface DesktopControlsBarProps {
  monitoring: boolean;
  onToggleMonitor: () => void;
  autoFetch: boolean;
  onAutoFetchChange: React.Dispatch<React.SetStateAction<boolean>>;
  refreshInterval: number;
  onRefreshIntervalChange: (v: number) => void;
  compareMode: boolean;
  onCompareModeChange: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function DesktopControlsBar({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, refreshInterval, onRefreshIntervalChange, compareMode, onCompareModeChange }: Readonly<DesktopControlsBarProps>) {
  return (
    <div className="hidden sm:flex items-center gap-2 ml-2">
      <button
        onClick={onToggleMonitor}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
          monitoring
            ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
            : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20'
        }`}
        title={monitoring ? 'Stop watching' : 'Start watching'}
        aria-label={monitoring ? 'Stop watching' : 'Start watching'}
        data-testid="watch-toggle-btn"
      >
        {monitoring ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        {monitoring ? 'Stop Watch' : 'Watch'}
      </button>
      <div className="flex items-center gap-1.5 text-xs text-white/80">
        <button
          type="button"
          role="switch"
          aria-label="Toggle auto-fetch"
          aria-checked={autoFetch}
          onClick={() => onAutoFetchChange((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoFetch ? 'bg-amber-500' : 'bg-gray-600'}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoFetch ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="whitespace-nowrap">Auto-fetch every</span>
        <select
          value={refreshInterval}
          onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
          disabled={!autoFetch}
          aria-label="Auto-fetch interval"
          className={`rounded bg-white/10 border border-white/20 text-white text-xs px-1.5 py-0.5 transition-opacity ${autoFetch ? 'hover:bg-white/20' : 'opacity-40 cursor-not-allowed'}`}
        >
          {REFRESH_INTERVALS.map((ri) => (
            <option key={ri.value} value={ri.value} className="bg-space-900 text-white">{ri.label}</option>
          ))}
        </select>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={compareMode}
        onClick={() => onCompareModeChange((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${
          compareMode
            ? 'bg-blue-500/20 border border-blue-400/40 text-blue-300 hover:bg-blue-500/30'
            : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20'
        }`}
        title={compareMode ? 'Disable compare' : 'Enable compare'}
      >
        <Columns2 className="w-3.5 h-3.5 text-blue-400" />
        Compare
      </button>
    </div>
  );
}
