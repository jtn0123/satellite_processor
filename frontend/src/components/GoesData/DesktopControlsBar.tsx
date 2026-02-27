import { Eye, EyeOff, Zap, Columns2 } from 'lucide-react';
import { REFRESH_INTERVALS } from './liveTabUtils';

interface DesktopControlsBarProps {
  monitoring: boolean;
  onToggleMonitor: () => void;
  autoFetch: boolean;
  onAutoFetchChange: (v: boolean) => void;
  refreshInterval: number;
  onRefreshIntervalChange: (v: number) => void;
  compareMode: boolean;
  onCompareModeChange: React.Dispatch<React.SetStateAction<boolean>>;
  autoFetchDisabled?: boolean;
  autoFetchDisabledReason?: string;
}

function getWatchButtonClass(active: boolean): string {
  return active
    ? 'bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
    : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20';
}

function getToggleSwitchClass(autoFetch: boolean, disabled?: boolean): string {
  if (disabled) return 'bg-gray-600 opacity-40 cursor-not-allowed';
  return autoFetch ? 'bg-amber-500' : 'bg-gray-600';
}

function getCompareButtonClass(active: boolean): string {
  return active
    ? 'bg-blue-500/20 border border-blue-400/40 text-blue-300 hover:bg-blue-500/30'
    : 'bg-white/10 border border-white/20 text-white/80 hover:text-white hover:bg-white/20';
}

export default function DesktopControlsBar({ monitoring, onToggleMonitor, autoFetch, onAutoFetchChange, refreshInterval, onRefreshIntervalChange, compareMode, onCompareModeChange, autoFetchDisabled, autoFetchDisabledReason }: Readonly<DesktopControlsBarProps>) {
  const watchLabel = monitoring ? 'Stop watching' : 'Start watching';
  const toggleKnobClass = autoFetch && !autoFetchDisabled ? 'translate-x-4' : 'translate-x-0.5';
  const selectClass = autoFetch ? 'hover:bg-white/20' : 'opacity-40 cursor-not-allowed';

  return (
    <div className="hidden sm:flex items-center gap-2 ml-2">
      <button
        type="button"
        onClick={onToggleMonitor}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${getWatchButtonClass(monitoring)}`}
        title={watchLabel}
        aria-label={watchLabel}
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
          aria-checked={autoFetch && !autoFetchDisabled}
          disabled={autoFetchDisabled}
          onClick={autoFetchDisabled ? undefined : () => onAutoFetchChange(!autoFetch)}
          title={autoFetchDisabled ? autoFetchDisabledReason : undefined}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${getToggleSwitchClass(autoFetch, autoFetchDisabled)}`}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${toggleKnobClass}`} />
        </button>
        <Zap className="w-3.5 h-3.5 text-amber-400" />
        <span className="whitespace-nowrap">Auto-fetch every</span>
        <select
          value={refreshInterval}
          onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
          disabled={!autoFetch}
          aria-label="Auto-fetch interval"
          className={`rounded bg-white/10 border border-white/20 text-white text-xs px-1.5 py-0.5 transition-opacity ${selectClass}`}
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
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors min-h-[44px] ${getCompareButtonClass(compareMode)}`}
        title={compareMode ? 'Disable compare' : 'Enable compare'}
      >
        <Columns2 className="w-3.5 h-3.5 text-blue-400" />
        Compare
      </button>
    </div>
  );
}
