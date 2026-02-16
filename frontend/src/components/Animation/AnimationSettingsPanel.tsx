import { Sliders } from 'lucide-react';
import type { AnimationConfig, SpeedPreset } from './types';
import { SPEED_MULTIPLIERS } from './types';

interface Props {
  config: AnimationConfig;
  captureIntervalMinutes: number;
  onChange: (updates: Partial<AnimationConfig>) => void;
}

const SPEED_LABELS: Record<SpeedPreset, string> = {
  realtime: 'Real-time',
  '2x': '2×',
  '5x': '5×',
  '10x': '10×',
  timelapse: 'Timelapse',
};

function calcFps(preset: SpeedPreset, intervalMin: number): number {
  if (intervalMin <= 0) return 10;
  const multiplier = SPEED_MULTIPLIERS[preset];
  return Math.max(1, Math.min(30, Math.round(multiplier / (intervalMin / 60))));
}

export default function AnimationSettingsPanel({ config, captureIntervalMinutes, onChange }: Readonly<Props>) {
  const handleSpeedPreset = (preset: SpeedPreset) => {
    onChange({ fps: calcFps(preset, captureIntervalMinutes) });
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-5">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Sliders className="w-5 h-5 text-primary" /> Animation Settings
      </h3>

      {/* Speed Presets */}
      <div role="group" aria-label="Speed Preset">
        <span className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Speed Preset</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SPEED_LABELS) as SpeedPreset[]).map((preset) => (
            <button
              key={preset}
              onClick={() => handleSpeedPreset(preset)}
              className="min-h-[44px] px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors"
            >
              {SPEED_LABELS[preset]}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Current: {config.fps} FPS</p>
      </div>

      {/* FPS Slider */}
      <div>
        <label htmlFor="settings-fps" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
          FPS: {config.fps}
        </label>
        <input
          id="settings-fps"
          type="range"
          min={1}
          max={30}
          value={config.fps}
          onChange={(e) => onChange({ fps: Number(e.target.value) })}
          className="w-full accent-primary"
        />
      </div>

      {/* Resolution */}
      <div role="group" aria-label="Resolution">
        <span className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Resolution</span>
        <div className="flex gap-2">
          <button
            onClick={() => onChange({ resolution: 'preview' })}
            className={`min-h-[44px] flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              config.resolution === 'preview'
                ? 'bg-primary text-gray-900 dark:text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
            }`}
          >
            Quick Preview (1024px)
          </button>
          <button
            onClick={() => onChange({ resolution: 'full' })}
            className={`min-h-[44px] flex-1 px-3 py-2 text-sm rounded-lg transition-colors ${
              config.resolution === 'full'
                ? 'bg-primary text-gray-900 dark:text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
            }`}
          >
            Full Quality
          </button>
        </div>
      </div>

      {/* Loop Style */}
      <div role="radiogroup" aria-label="Loop Style">
        <span className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Loop Style</span>
        <div className="flex gap-2 flex-wrap">
          {([
            { value: 'forward', label: 'Forward' },
            { value: 'pingpong', label: 'Ping-pong' },
            { value: 'hold', label: 'Hold last frame' },
          ] as const).map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 min-h-[44px] px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 cursor-pointer">
              <input
                type="radio"
                name="loop_style"
                checked={config.loop_style === value}
                onChange={() => onChange({ loop_style: value })}
                className="accent-primary"
              />
              <span className="text-sm text-gray-600 dark:text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Format */}
      <div>
        <label htmlFor="settings-format" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Format</label>
        <select
          id="settings-format"
          value={config.format}
          onChange={(e) => onChange({ format: e.target.value as AnimationConfig['format'] })}
          className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
        >
          <option value="mp4">MP4</option>
          <option value="gif">GIF</option>
          <option value="webm">WebM</option>
        </select>
      </div>

      {/* Quality */}
      <div role="group" aria-label="Quality">
        <span className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Quality</span>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map((q) => (
            <button
              key={q}
              onClick={() => onChange({ quality: q })}
              className={`min-h-[44px] flex-1 px-3 py-2 text-sm rounded-lg capitalize transition-colors ${
                config.quality === q
                  ? 'bg-primary text-gray-900 dark:text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
              }`}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Overlays */}
      <div role="group" aria-label="Overlays">
        <span className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Overlays</span>
        <div className="space-y-2">
          {([
            { key: 'show_timestamp', label: 'Show timestamp' },
            { key: 'show_label', label: 'Show satellite/band label' },
            { key: 'show_colorbar', label: 'Show colorbar' },
          ] as const).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={config.overlays[key]}
                onChange={(e) =>
                  onChange({
                    overlays: { ...config.overlays, [key]: e.target.checked },
                  })
                }
                className="rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-primary"
              />
              <span className="text-sm text-gray-600 dark:text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
