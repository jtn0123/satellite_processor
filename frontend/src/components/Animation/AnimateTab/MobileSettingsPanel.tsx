import { Sliders, X } from 'lucide-react';
import AnimationSettingsPanel from '../AnimationSettingsPanel';
import AnimationPresets from '../AnimationPresets';
import type { AnimationConfig, AnimationPreset } from '../types';

interface MobileSettingsPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly config: AnimationConfig;
  readonly captureInterval: number;
  readonly onChange: (updates: Partial<AnimationConfig>) => void;
  readonly onLoadPreset: (preset: AnimationPreset) => void;
}

export function MobileSettingsPanel({
  open,
  onClose,
  config,
  captureInterval,
  onChange,
  onLoadPreset,
}: MobileSettingsPanelProps) {
  if (!open) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="relative bg-white dark:bg-slate-950 rounded-t-2xl max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl">
        <div className="sticky top-0 bg-white dark:bg-slate-950 px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between z-10">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sliders className="w-5 h-5 text-primary" /> Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <AnimationSettingsPanel
            config={config}
            captureIntervalMinutes={captureInterval}
            onChange={onChange}
          />
          <AnimationPresets config={config} onLoadPreset={onLoadPreset} />
        </div>
      </div>
    </div>
  );
}
