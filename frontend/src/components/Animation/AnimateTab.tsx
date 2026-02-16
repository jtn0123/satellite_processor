import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2, Clock, Trash2, Download } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { formatBytes } from '../GoesData/utils';
import FrameRangePreview from './FrameRangePreview';
import AnimationSettingsPanel from './AnimationSettingsPanel';
import BatchAnimationPanel from './BatchAnimationPanel';
import AnimationPresets from './AnimationPresets';
import type { AnimationConfig, AnimationPreset, PreviewRangeResponse } from './types';
import type { PaginatedAnimations } from '../GoesData/types';
import { SATELLITES, SECTORS, BANDS, QUICK_HOURS } from './types';
import { extractArray } from '../../utils/safeData';

const DEFAULT_CONFIG: AnimationConfig = {
  satellite: 'GOES-16',
  sector: 'CONUS',
  band: 'C02',
  start_date: '',
  end_date: '',
  fps: 10,
  format: 'mp4',
  quality: 'medium',
  resolution: 'preview',
  loop_style: 'forward',
  overlays: { show_timestamp: true, show_label: true, show_colorbar: false },
  name: '',
};

export default function AnimateTab() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<AnimationConfig>({ ...DEFAULT_CONFIG });

  const updateConfig = useCallback((updates: Partial<AnimationConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const handleQuickHours = useCallback((hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    // Format for datetime-local input
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setConfig((prev) => ({ ...prev, start_date: fmt(start), end_date: fmt(end) }));
  }, []);

  const handleLoadPreset = useCallback((preset: AnimationPreset) => {
    setConfig((prev) => ({ ...prev, ...preset.config }));
    showToast('success', `Loaded preset: ${preset.name}`);
  }, []);

  // Preview query
  const previewEnabled = !!(config.satellite && config.sector && config.band && config.start_date && config.end_date);
  const previewParams = useMemo(
    () => ({
      satellite: config.satellite,
      sector: config.sector,
      band: config.band,
      start_date: config.start_date ? new Date(config.start_date).toISOString() : '',
      end_date: config.end_date ? new Date(config.end_date).toISOString() : '',
    }),
    [config.satellite, config.sector, config.band, config.start_date, config.end_date],
  );

  const {
    data: previewData,
    isLoading: previewLoading,
    isError: previewError,
  } = useQuery<PreviewRangeResponse>({
    queryKey: ['frame-preview-range', previewParams],
    queryFn: () => api.get('/goes/frames/preview-range', { params: previewParams }).then((r) => r.data),
    enabled: previewEnabled,
  });

  // Generate animation
  const generateMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: config.name || `${config.satellite} ${config.band} ${config.sector}`,
        satellite: config.satellite,
        sector: config.sector,
        band: config.band,
        start_date: new Date(config.start_date).toISOString(),
        end_date: new Date(config.end_date).toISOString(),
        fps: config.fps,
        format: config.format,
        quality: config.quality,
        resolution: config.resolution,
        loop_style: config.loop_style,
        overlays: config.overlays,
      };
      return api.post('/goes/animations/from-range', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
      showToast('success', 'Animation generation started!');
    },
    onError: () => showToast('error', 'Failed to start animation generation'),
  });

  // Animation history
  const { data: animations } = useQuery<PaginatedAnimations>({
    queryKey: ['animations'],
    queryFn: () => api.get('/goes/animations').then((r) => r.data),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/animations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
      showToast('success', 'Animation deleted');
    },
    onError: () => showToast('error', 'Failed to delete animation'),
  });

  const captureInterval = previewData?.capture_interval_minutes ?? 10;
  const animationItems = extractArray<PaginatedAnimations['items'][number]>(animations);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Selection & Preview */}
        <div className="lg:col-span-2 space-y-4">
          {/* Satellite/Sector/Band selectors */}
          <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
            <h3 className="text-lg font-semibold">Create Animation</h3>

            {/* Animation Name */}
            <div>
              <label htmlFor="animate-name" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
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

            {/* Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="animate-satellite" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
                  Satellite
                </label>
                <select
                  id="animate-satellite"
                  value={config.satellite}
                  onChange={(e) => updateConfig({ satellite: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {SATELLITES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="animate-sector" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
                  Sector
                </label>
                <select
                  id="animate-sector"
                  value={config.sector}
                  onChange={(e) => updateConfig({ sector: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="animate-band" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
                  Band
                </label>
                <select
                  id="animate-band"
                  value={config.band}
                  onChange={(e) => updateConfig({ band: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                >
                  {BANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick buttons */}
            <div>
              <label className="block text-xs text-gray-400 dark:text-slate-500 mb-2">Quick Range</label>
              <div className="flex flex-wrap gap-2">
                {QUICK_HOURS.map((h) => (
                  <button
                    key={h}
                    onClick={() => handleQuickHours(h)}
                    className="min-h-[44px] px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Last {h}h
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="animate-start" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
                  Start Date/Time
                </label>
                <input
                  id="animate-start"
                  type="datetime-local"
                  value={config.start_date}
                  onChange={(e) => updateConfig({ start_date: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="animate-end" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">
                  End Date/Time
                </label>
                <input
                  id="animate-end"
                  type="datetime-local"
                  value={config.end_date}
                  onChange={(e) => updateConfig({ end_date: e.target.value })}
                  className="w-full min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
                />
              </div>
            </div>
          </div>

          {/* Frame Range Preview */}
          {previewEnabled && (
            <FrameRangePreview
              data={previewData}
              isLoading={previewLoading}
              isError={previewError}
            />
          )}

          {/* Generate Button */}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !previewEnabled || (previewData?.total_count === 0)}
            className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 btn-primary-mix text-gray-900 dark:text-white rounded-xl disabled:opacity-50 transition-colors font-medium text-base"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            {generateMutation.isPending ? 'Generating...' : 'Generate Animation'}
          </button>

          {/* Batch Panel */}
          <BatchAnimationPanel currentConfig={config} />
        </div>

        {/* Right: Settings & Presets */}
        <div className="space-y-4">
          <AnimationSettingsPanel
            config={config}
            captureIntervalMinutes={captureInterval}
            onChange={updateConfig}
          />
          <AnimationPresets config={config} onLoadPreset={handleLoadPreset} />
        </div>
      </div>

      {/* Animation History */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Animation History</h3>
        {animationItems.length > 0 ? (
          <div className="space-y-3">
            {animationItems.map((anim) => (
              <div key={anim.id} className="flex items-center gap-4 bg-gray-100/50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{anim.name}</div>
                  <div className="text-xs text-gray-400 dark:text-slate-500">
                    {anim.frame_count} frames · {anim.fps} FPS · {anim.format.toUpperCase()} · {anim.quality}
                    {anim.file_size > 0 && ` · ${formatBytes(anim.file_size)}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {anim.status === 'pending' && (
                    <span className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded">Pending</span>
                  )}
                  {anim.status === 'processing' && (
                    <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded animate-pulse">Processing</span>
                  )}
                  {anim.status === 'completed' && (
                    <>
                      <span className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded">Done</span>
                      {anim.output_path && (
                        <a
                          href={`/api/download?path=${encodeURIComponent(anim.output_path)}`}
                          download
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-primary hover:text-primary/80 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </>
                  )}
                  {anim.status === 'failed' && (
                    <span className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded" title={anim.error}>Failed</span>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(anim.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 dark:text-slate-500 py-8">
            No animations yet. Configure settings and generate one above!
          </div>
        )}
      </div>
    </div>
  );
}
