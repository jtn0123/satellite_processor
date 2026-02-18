import { useState } from 'react';
import { Settings, Play, Square, Clock } from 'lucide-react';

export interface MonitorPreset {
  label: string;
  satellite?: string;
  sector: string;
  band?: string;
  interval: number; // ms
}

export const MONITOR_PRESETS: MonitorPreset[] = [
  { label: 'Watch CONUS every 10 min', sector: 'CONUS', interval: 600000 },
  { label: 'Full Disk hourly', sector: 'FULL', interval: 3600000 },
  { label: 'Mesoscale every 5 min', sector: 'M1', interval: 300000 },
];

const CUSTOM_INTERVALS = [
  { label: '1 min', value: 60000 },
  { label: '5 min', value: 300000 },
  { label: '10 min', value: 600000 },
  { label: '15 min', value: 900000 },
  { label: '30 min', value: 1800000 },
  { label: '1 hour', value: 3600000 },
];

interface MonitorSettingsPanelProps {
  isMonitoring: boolean;
  interval: number;
  satellite: string;
  sector: string;
  band: string;
  onStart: (config: { satellite: string; sector: string; band: string; interval: number }) => void;
  onStop: () => void;
  onApplyPreset: (preset: MonitorPreset) => void;
  satellites: string[];
  sectors: { id: string; name: string }[];
  bands: { id: string; description: string }[];
}

export default function MonitorSettingsPanel({
  isMonitoring,
  interval,
  satellite,
  sector,
  band,
  onStart,
  onStop,
  onApplyPreset,
  satellites,
  sectors,
  bands,
}: Readonly<MonitorSettingsPanelProps>) {
  const [open, setOpen] = useState(false);
  const [customInterval, setCustomInterval] = useState(interval);
  const [customSatellite, setCustomSatellite] = useState(satellite);
  const [customSector, setCustomSector] = useState(sector);
  const [customBand, setCustomBand] = useState(band);

  return (
    <div className="relative" data-testid="monitor-settings-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`p-2 rounded-lg backdrop-blur-md border transition-colors ${
          isMonitoring
            ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/30'
            : 'bg-white/10 border-white/20 text-white/80 hover:text-white hover:bg-white/20'
        }`}
        title="Monitor settings"
        aria-label="Monitor settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 p-4 space-y-4"
          data-testid="monitor-settings-dropdown"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Monitor Settings
            </h3>
            {isMonitoring && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            )}
          </div>

          {/* Presets */}
          <div className="space-y-1.5">
            <label className="text-xs text-white/60 uppercase tracking-wider">Quick Presets</label>
            {MONITOR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  onApplyPreset(preset);
                  setCustomSector(preset.sector);
                  setCustomInterval(preset.interval);
                  if (preset.band) setCustomBand(preset.band);
                  if (preset.satellite) setCustomSatellite(preset.satellite);
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom config */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="text-xs text-white/60 uppercase tracking-wider">Custom Configuration</label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={customSatellite}
                onChange={(e) => setCustomSatellite(e.target.value)}
                className="rounded-lg bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5"
                aria-label="Monitor satellite"
              >
                {satellites.map((s) => (
                  <option key={s} value={s} className="bg-gray-900">{s}</option>
                ))}
              </select>
              <select
                value={customSector}
                onChange={(e) => setCustomSector(e.target.value)}
                className="rounded-lg bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5"
                aria-label="Monitor sector"
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id} className="bg-gray-900">{s.name}</option>
                ))}
              </select>
              <select
                value={customBand}
                onChange={(e) => setCustomBand(e.target.value)}
                className="rounded-lg bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5"
                aria-label="Monitor band"
              >
                {bands.map((b) => (
                  <option key={b.id} value={b.id} className="bg-gray-900">{b.id}</option>
                ))}
              </select>
              <select
                value={customInterval}
                onChange={(e) => setCustomInterval(Number(e.target.value))}
                className="rounded-lg bg-white/10 border border-white/20 text-white text-xs px-2 py-1.5"
                aria-label="Monitor interval"
              >
                {CUSTOM_INTERVALS.map((ci) => (
                  <option key={ci.value} value={ci.value} className="bg-gray-900">{ci.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Start/Stop */}
          <div className="flex gap-2">
            {isMonitoring ? (
              <button
                onClick={() => { onStop(); setOpen(false); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 border border-red-400/30 text-red-300 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors"
                data-testid="monitor-stop-btn"
              >
                <Square className="w-4 h-4" />
                Stop Monitoring
              </button>
            ) : (
              <button
                onClick={() => {
                  onStart({
                    satellite: customSatellite,
                    sector: customSector,
                    band: customBand,
                    interval: customInterval,
                  });
                  setOpen(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-colors"
                data-testid="monitor-start-btn"
              >
                <Play className="w-4 h-4" />
                Start Monitoring
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
