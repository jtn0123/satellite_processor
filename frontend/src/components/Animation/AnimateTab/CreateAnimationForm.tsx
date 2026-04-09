import { Film, Sliders, Clock } from 'lucide-react';
import type { AnimationConfig, PreviewRangeResponse } from '../types';
import type { CollectionType } from '../../GoesData/types';
import {
  SATELLITES,
  SECTORS,
  GOES_BANDS,
  HIMAWARI_BANDS,
  HIMAWARI_SATELLITES,
  QUICK_HOURS,
} from '../types';
import FrameRangePreview from '../FrameRangePreview';
import { DateTimeField } from '../../ui/DateTimeField';

interface CreateAnimationFormProps {
  readonly config: AnimationConfig;
  readonly updateConfig: (updates: Partial<AnimationConfig>) => void;
  readonly sourceMode: 'filters' | 'collection';
  readonly setSourceMode: (v: 'filters' | 'collection') => void;
  readonly collectionId: string;
  readonly setCollectionId: (v: string) => void;
  readonly collections: CollectionType[] | undefined;
  readonly handleQuickHours: (hours: number) => void;
  readonly previewEnabled: boolean;
  readonly previewData: PreviewRangeResponse | undefined;
  readonly previewLoading: boolean;
  readonly previewError: boolean;
  readonly onOpenSettings: () => void;
}

export function CreateAnimationForm({
  config,
  updateConfig,
  sourceMode,
  setSourceMode,
  collectionId,
  setCollectionId,
  collections,
  handleQuickHours,
  previewEnabled,
  previewData,
  previewLoading,
  previewError,
  onOpenSettings,
}: CreateAnimationFormProps) {
  return (
    <div className="lg:col-span-2 space-y-4">
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" /> Create Animation
          </h3>
          <button
            type="button"
            onClick={onOpenSettings}
            className="lg:hidden min-h-[44px] flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300"
          >
            <Sliders className="w-4 h-4" /> Settings
          </button>
        </div>

        <div>
          <label
            htmlFor="animate-name"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Animation Name
          </label>
          <input
            id="animate-name"
            type="text"
            value={config.name}
            onChange={(e) => updateConfig({ name: e.target.value })}
            placeholder="Auto-generated if empty"
            className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSourceMode('filters')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              sourceMode === 'filters'
                ? 'bg-primary text-gray-900 dark:text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            By Filters
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('collection')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              sourceMode === 'collection'
                ? 'bg-primary text-gray-900 dark:text-white'
                : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            From Collection
          </button>
        </div>

        {sourceMode === 'filters' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="animate-satellite"
                  className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
                >
                  Satellite
                </label>
                <select
                  id="animate-satellite"
                  value={config.satellite}
                  onChange={(e) => updateConfig({ satellite: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {SATELLITES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="animate-sector"
                  className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
                >
                  Sector
                </label>
                <select
                  id="animate-sector"
                  value={config.sector}
                  onChange={(e) => updateConfig({ sector: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="animate-band"
                  className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
                >
                  Band
                </label>
                <select
                  id="animate-band"
                  value={config.band}
                  onChange={(e) => updateConfig({ band: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {(HIMAWARI_SATELLITES.includes(config.satellite)
                    ? HIMAWARI_BANDS
                    : GOES_BANDS
                  ).map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="border-0 p-0 m-0">
              <legend className="text-xs text-gray-400 dark:text-slate-500 mb-2">
                Quick Range
              </legend>
              <div className="flex flex-wrap gap-2">
                {QUICK_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleQuickHours(h)}
                    className="min-h-[44px] px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" /> Last {h}h
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateTimeField
                id="animate-start"
                label="Start date and time"
                labelClassName="block text-xs text-gray-400 dark:text-slate-500 mb-1"
                inputClassName="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                value={config.start_date}
                onChange={(v) => updateConfig({ start_date: v })}
              />
              <DateTimeField
                id="animate-end"
                label="End date and time"
                labelClassName="block text-xs text-gray-400 dark:text-slate-500 mb-1"
                inputClassName="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                value={config.end_date}
                onChange={(v) => updateConfig({ end_date: v })}
              />
            </div>
          </>
        ) : (
          <div>
            <label
              htmlFor="animate-collection"
              className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
            >
              Collection
            </label>
            <select
              id="animate-collection"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
            >
              <option value="">Select collection...</option>
              {(collections ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.frame_count ?? 0} frames)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sourceMode === 'filters' && previewEnabled && (
        <FrameRangePreview data={previewData} isLoading={previewLoading} isError={previewError} />
      )}
    </div>
  );
}
