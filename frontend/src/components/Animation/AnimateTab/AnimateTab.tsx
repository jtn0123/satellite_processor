import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import AnimationSettingsPanel from '../AnimationSettingsPanel';
import AnimationPresets from '../AnimationPresets';
import BatchAnimationPanel from '../BatchAnimationPanel';
import type { AnimationConfig, AnimationPreset, PreviewRangeResponse } from '../types';
import type { PaginatedAnimations, CollectionType } from '../../GoesData/types';
import { SATELLITES } from '../types';
import { extractArray } from '../../../utils/safeData';
import { defaultDateTimeRange } from '../../ui/dateTimeHelpers';

import { QuickStartChips } from './QuickStartChips';
import { AnimationHistory } from './AnimationHistory';
import { CreateAnimationForm } from './CreateAnimationForm';
import { MobileSettingsPanel } from './MobileSettingsPanel';

// Default to "last hour → now" so the native datetime-local picker has a
// real starting value (avoids Month=0 spinbutton state — see JTN-422).
const DEFAULT_RANGE = defaultDateTimeRange(1);

const DEFAULT_CONFIG: AnimationConfig = {
  satellite: SATELLITES[0],
  sector: 'CONUS',
  band: 'C02',
  start_date: DEFAULT_RANGE.start,
  end_date: DEFAULT_RANGE.end,
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
  const [sourceMode, setSourceMode] = useState<'filters' | 'collection'>('filters');
  const [collectionId, setCollectionId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: productsData } = useQuery<{ default_satellite?: string }>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
    staleTime: 300_000,
  });
  const defaultSatellite = productsData?.default_satellite ?? 'GOES-19';

  useEffect(() => {
    if (productsData?.default_satellite) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time default init
      setConfig((prev) =>
        prev.satellite === DEFAULT_CONFIG.satellite
          ? { ...prev, satellite: productsData.default_satellite! }
          : prev,
      );
    }
  }, [productsData]);

  const updateConfig = useCallback((updates: Partial<AnimationConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const setDateRange = useCallback((hours: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const fmt = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setConfig((prev) => ({ ...prev, start_date: fmt(start), end_date: fmt(end) }));
  }, []);

  const handleQuickHours = useCallback(
    (hours: number) => {
      setDateRange(hours);
    },
    [setDateRange],
  );

  const handleQuickStartChip = useCallback(
    (updates: Partial<AnimationConfig> & { hours?: number }) => {
      const { hours, ...configUpdates } = updates;
      setSourceMode('filters');
      setConfig((prev) => ({ ...prev, ...configUpdates }));
      if (hours) setDateRange(hours);
    },
    [setDateRange],
  );

  const handleLoadPreset = useCallback((preset: AnimationPreset) => {
    setConfig((prev) => ({ ...prev, ...preset.config }));
    showToast('success', `Loaded preset: ${preset.name}`);
  }, []);

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/satellite/collections').then((r) => extractArray(r.data)),
  });

  const previewEnabled =
    sourceMode === 'collection'
      ? !!collectionId
      : !!(
          config.satellite &&
          config.sector &&
          config.band &&
          config.start_date &&
          config.end_date
        );

  const previewParams = useMemo(
    () => ({
      satellite: config.satellite,
      sector: config.sector,
      band: config.band,
      // JTN-465: backend expects `start_time` / `end_time` on
      // /satellite/frames/preview-range. We were sending `start_date` /
      // `end_date`, which returned 422 Unprocessable Entity, so every
      // Animate quick-start preset (Hurricane Watch, Visible Timelapse,
      // Storm Cell, Full Disk, Fire Watch) silently showed an empty
      // preview.
      start_time: config.start_date ? new Date(config.start_date).toISOString() : '',
      end_time: config.end_date ? new Date(config.end_date).toISOString() : '',
    }),
    [config.satellite, config.sector, config.band, config.start_date, config.end_date],
  );

  const {
    data: previewData,
    isLoading: previewLoading,
    isError: previewError,
  } = useQuery<PreviewRangeResponse>({
    queryKey: ['frame-preview-range', previewParams],
    queryFn: () =>
      api.get('/satellite/frames/preview-range', { params: previewParams }).then((r) => r.data),
    enabled: sourceMode === 'filters' && previewEnabled,
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      if (sourceMode === 'collection' && collectionId) {
        const payload: Record<string, unknown> = {
          name: config.name || `Collection Animation ${new Date().toLocaleString()}`,
          collection_id: collectionId,
          fps: config.fps,
          format: config.format,
          quality: config.quality,
          resolution: config.resolution,
          loop_style: config.loop_style,
          overlays: config.overlays,
        };
        return api.post('/satellite/animations', payload).then((r) => r.data);
      }
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
      return api.post('/satellite/animations/from-range', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
      showToast('success', 'Animation generation started!');
    },
    onError: () => showToast('error', 'Failed to start animation generation'),
  });

  const { data: animations } = useQuery<PaginatedAnimations>({
    queryKey: ['animations'],
    queryFn: () => api.get('/satellite/animations').then((r) => r.data),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/satellite/animations/${id}`),
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
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400">Quick Start</h3>
        <QuickStartChips onApply={handleQuickStartChip} defaultSatellite={defaultSatellite} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <CreateAnimationForm
          config={config}
          updateConfig={updateConfig}
          sourceMode={sourceMode}
          setSourceMode={setSourceMode}
          collectionId={collectionId}
          setCollectionId={setCollectionId}
          collections={collections}
          handleQuickHours={handleQuickHours}
          previewEnabled={previewEnabled}
          previewData={previewData}
          previewLoading={previewLoading}
          previewError={previewError}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <div className="hidden lg:block space-y-4">
          <AnimationSettingsPanel
            config={config}
            captureIntervalMinutes={captureInterval}
            onChange={updateConfig}
          />
          <AnimationPresets config={config} onLoadPreset={handleLoadPreset} />
        </div>
      </div>

      {/* Latest animation inline preview */}
      {animationItems.length > 0 &&
        animationItems[0].status === 'completed' &&
        animationItems[0].output_path && (
          <div className="card p-4">
            <h4 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-3">
              Latest Animation
            </h4>
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              {animationItems[0].format === 'gif' ? (
                <img
                  src={`/api/download?path=${encodeURIComponent(animationItems[0].output_path)}`}
                  alt={animationItems[0].name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  src={`/api/download?path=${encodeURIComponent(animationItems[0].output_path)}`}
                  controls
                  loop
                  className="w-full h-full object-contain"
                >
                  <track kind="captions" />
                </video>
              )}
            </div>
          </div>
        )}

      {/* Generate Button */}
      <button
        type="button"
        onClick={() => generateMutation.mutate()}
        disabled={
          generateMutation.isPending ||
          !previewEnabled ||
          (sourceMode === 'filters' && previewData?.total_count === 0)
        }
        className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 btn-primary-mix text-gray-900 dark:text-white rounded-xl disabled:opacity-50 transition-colors font-medium text-base"
      >
        {generateMutation.isPending ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Play className="w-5 h-5" />
        )}
        {generateMutation.isPending ? 'Generating...' : 'Generate Animation'}
      </button>

      <BatchAnimationPanel currentConfig={config} />

      <MobileSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        captureInterval={captureInterval}
        onChange={updateConfig}
        onLoadPreset={handleLoadPreset}
      />

      <AnimationHistory items={animationItems} onDelete={(id) => deleteMutation.mutate(id)} />
    </div>
  );
}
