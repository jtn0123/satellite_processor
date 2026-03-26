import { Sliders, Play, CheckCircle } from 'lucide-react';
import type { CropPreset } from '../types';

interface StudioSettingsProps {
  readonly animName: string;
  readonly setAnimName: (v: string) => void;
  readonly fps: number;
  readonly setFps: (v: number) => void;
  readonly format: 'mp4' | 'gif';
  readonly setFormat: (v: 'mp4' | 'gif') => void;
  readonly quality: 'low' | 'medium' | 'high';
  readonly setQuality: (v: 'low' | 'medium' | 'high') => void;
  readonly cropPresetId: string;
  readonly setCropPresetId: (v: string) => void;
  readonly falseColor: boolean;
  readonly setFalseColor: (v: boolean) => void;
  readonly scale: string;
  readonly setScale: (v: string) => void;
  readonly cropPresets: CropPreset[] | undefined;
  readonly canGenerate: boolean;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly isError: boolean;
  readonly onGenerate: () => void;
}

export function StudioSettings({
  animName,
  setAnimName,
  fps,
  setFps,
  format,
  setFormat,
  quality,
  setQuality,
  cropPresetId,
  setCropPresetId,
  falseColor,
  setFalseColor,
  scale,
  setScale,
  cropPresets,
  canGenerate,
  isPending,
  isSuccess,
  isError,
  onGenerate,
}: StudioSettingsProps) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Sliders className="w-5 h-5 text-primary" /> Settings
        </h3>

        <div>
          <label
            htmlFor="anim-animation-name"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Animation Name
          </label>
          <input
            id="anim-animation-name"
            type="text"
            value={animName}
            onChange={(e) => setAnimName(e.target.value)}
            placeholder="Untitled Animation"
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
          />
        </div>

        <div>
          <label
            htmlFor="anim-fps-fps"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            FPS: {fps}
          </label>
          <input
            id="anim-fps-fps"
            type="range"
            min={1}
            max={30}
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label
            htmlFor="anim-format"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Format
          </label>
          <fieldset aria-label="Animation format" className="flex gap-2 border-0 p-0 m-0">
            {(['mp4', 'gif'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                aria-pressed={format === f}
                className={`px-4 py-1.5 text-sm rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${format === f ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </fieldset>
        </div>

        <div>
          <label
            htmlFor="anim-quality"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Quality
          </label>
          <fieldset aria-label="Animation quality" className="flex gap-2 border-0 p-0 m-0">
            {(['low', 'medium', 'high'] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQuality(q)}
                aria-pressed={quality === q}
                className={`px-3 py-1.5 text-sm rounded-lg capitalize focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${quality === q ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
              >
                {q}
              </button>
            ))}
          </fieldset>
        </div>

        <div>
          <label
            htmlFor="anim-crop-preset"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Crop Preset
          </label>
          <select
            id="anim-crop-preset"
            value={cropPresetId}
            onChange={(e) => setCropPresetId(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
          >
            <option value="">None (full frame)</option>
            {(cropPresets ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.width}×{p.height})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="anim-scale"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Scale
          </label>
          <select
            id="anim-scale"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
          >
            <option value="100%">100% (Original)</option>
            <option value="75%">75%</option>
            <option value="50%">50%</option>
            <option value="25%">25%</option>
          </select>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={falseColor}
            onChange={(e) => setFalseColor(e.target.checked)}
            className="rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-primary"
          />
          <span className="text-sm text-gray-600 dark:text-slate-300">Apply false color</span>
        </label>

        <button
          onClick={onGenerate}
          disabled={isPending || !canGenerate}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
        >
          <Play className="w-5 h-5" />
          {isPending ? 'Creating...' : 'Generate Animation'}
        </button>

        {isSuccess && (
          <div className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Animation job created!
          </div>
        )}
        {isError && <div className="text-sm text-red-400">Failed to create animation</div>}
      </div>
    </div>
  );
}
