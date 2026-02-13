import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Satellite,
  Trash2,
  CheckCircle,
  Play,
  Film,
  Sliders,
} from 'lucide-react';
import api from '../../api/client';
import { formatBytes } from './utils';
import type { Product, CollectionType, PaginatedFrames, CropPreset, PaginatedAnimations } from './types';

export default function AnimationStudioTab() {
  const queryClient = useQueryClient();

  // Frame selection mode
  const [selectionMode, setSelectionMode] = useState<'filters' | 'collection'>('filters');
  const [satellite, setSatellite] = useState('');
  const [band, setBand] = useState('');
  const [sector, setSector] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [collectionId, setCollectionId] = useState('');

  // Settings
  const [animName, setAnimName] = useState('');
  const [fps, setFps] = useState(10);
  const [format, setFormat] = useState<'mp4' | 'gif'>('mp4');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [cropPresetId, setCropPresetId] = useState('');
  const [falseColor, setFalseColor] = useState(false);
  const [scale, setScale] = useState('100%');

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => r.data),
  });

  const { data: cropPresets } = useQuery<CropPreset[]>({
    queryKey: ['crop-presets'],
    queryFn: () => api.get('/goes/crop-presets').then((r) => r.data),
  });

  // Preview frames based on current filters
  const previewParams: Record<string, string | number> = { page: 1, limit: 20, sort: 'capture_time', order: 'asc' };
  if (selectionMode === 'filters') {
    if (satellite) previewParams.satellite = satellite;
    if (band) previewParams.band = band;
    if (sector) previewParams.sector = sector;
  } else if (collectionId) {
    previewParams.collection_id = collectionId;
  }

  const { data: previewFrames } = useQuery<PaginatedFrames>({
    queryKey: ['anim-preview-frames', previewParams],
    queryFn: () => api.get('/goes/frames', { params: previewParams }).then((r) => r.data),
    enabled: selectionMode === 'collection' ? !!collectionId : !!(satellite || band || sector),
  });

  // Animation history
  const { data: animations } = useQuery<PaginatedAnimations>({
    queryKey: ['animations'],
    queryFn: () => api.get('/goes/animations').then((r) => r.data),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: animName || `Animation ${new Date().toLocaleString()}`,
        fps,
        format,
        quality,
        false_color: falseColor,
        scale,
      };
      if (cropPresetId) payload.crop_preset_id = cropPresetId;
      if (selectionMode === 'filters') {
        if (satellite) payload.satellite = satellite;
        if (band) payload.band = band;
        if (sector) payload.sector = sector;
        if (startDate) payload.start_date = new Date(startDate).toISOString();
        if (endDate) payload.end_date = new Date(endDate).toISOString();
      } else if (collectionId) {
        payload.collection_id = collectionId;
      }
      return api.post('/goes/animations', payload).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animations'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/animations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['animations'] }),
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Frame Selection */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" /> Frame Selection
            </h3>

            <div className="flex gap-2">
              <button onClick={() => setSelectionMode('filters')}
                className={`px-3 py-1.5 text-sm rounded-lg ${selectionMode === 'filters' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}`}>
                By Filters
              </button>
              <button onClick={() => setSelectionMode('collection')}
                className={`px-3 py-1.5 text-sm rounded-lg ${selectionMode === 'collection' ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}`}>
                From Collection
              </button>
            </div>

            {selectionMode === 'filters' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="anim-satellite" className="block text-xs text-slate-500 mb-1">Satellite</label>
                  <select id="anim-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="anim-band" className="block text-xs text-slate-500 mb-1">Band</label>
                  <select id="anim-band" value={band} onChange={(e) => setBand(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="anim-sector" className="block text-xs text-slate-500 mb-1">Sector</label>
                  <select id="anim-sector" value={sector} onChange={(e) => setSector(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="anim-start-date" className="block text-xs text-slate-500 mb-1">Start Date</label>
                  <input id="anim-start-date" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
                </div>
                <div>
                  <label htmlFor="anim-end-date" className="block text-xs text-slate-500 mb-1">End Date</label>
                  <input id="anim-end-date" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="anim-collection" className="block text-xs text-slate-500 mb-1">Collection</label>
                <select id="anim-collection" value={collectionId} onChange={(e) => setCollectionId(e.target.value)}
                  className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                  <option value="">Select collection...</option>
                  {collections?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.frame_count} frames)</option>)}
                </select>
              </div>
            )}

            {/* Preview strip */}
            {previewFrames && previewFrames.total > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  {previewFrames.total} frames matched (showing first {previewFrames.items.length})
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {previewFrames.items.map((frame) => (
                    <div key={frame.id} className="flex-shrink-0 w-24">
                      <div className="aspect-video bg-slate-800 rounded overflow-hidden">
                        {frame.thumbnail_path ? (
                          <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
                            alt={`${frame.satellite} ${frame.band} preview`} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Satellite className="w-4 h-4 text-slate-600" />
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 truncate">
                        {new Date(frame.capture_time).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Settings Panel */}
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sliders className="w-5 h-5 text-primary" /> Settings
            </h3>

            <div>
              <label htmlFor="anim-animation-name" className="block text-xs text-slate-500 mb-1">Animation Name</label>
              <input id="anim-animation-name" type="text" value={animName} onChange={(e) => setAnimName(e.target.value)}
                placeholder="Untitled Animation"
                className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
            </div>

            <div>
              <label htmlFor="anim-fps-fps" className="block text-xs text-slate-500 mb-1">FPS: {fps}</label>
              <input id="anim-fps-fps" type="range" min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value))}
                className="w-full accent-primary" />
            </div>

            <div>
              <label htmlFor="anim-format" className="block text-xs text-slate-500 mb-1">Format</label>
              <div className="flex gap-2">
                {(['mp4', 'gif'] as const).map((f) => (
                  <button key={f} onClick={() => setFormat(f)}
                    className={`px-4 py-1.5 text-sm rounded-lg ${format === f ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="anim-quality" className="block text-xs text-slate-500 mb-1">Quality</label>
              <div className="flex gap-2">
                {(['low', 'medium', 'high'] as const).map((q) => (
                  <button key={q} onClick={() => setQuality(q)}
                    className={`px-3 py-1.5 text-sm rounded-lg capitalize ${quality === q ? 'bg-primary text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="anim-crop-preset" className="block text-xs text-slate-500 mb-1">Crop Preset</label>
              <select id="anim-crop-preset" value={cropPresetId} onChange={(e) => setCropPresetId(e.target.value)}
                className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                <option value="">None (full frame)</option>
                {cropPresets?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.width}×{p.height})</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="anim-scale" className="block text-xs text-slate-500 mb-1">Scale</label>
              <select id="anim-scale" value={scale} onChange={(e) => setScale(e.target.value)}
                className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                <option value="100%">100% (Original)</option>
                <option value="75%">75%</option>
                <option value="50%">50%</option>
                <option value="25%">25%</option>
              </select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={falseColor} onChange={(e) => setFalseColor(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-primary" />
              <span className="text-sm text-slate-300">Apply false color</span>
            </label>

            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || (!previewFrames?.total)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
            >
              <Play className="w-5 h-5" />
              {createMutation.isPending ? 'Creating...' : 'Generate Animation'}
            </button>

            {createMutation.isSuccess && (
              <div className="text-sm text-emerald-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Animation job created!
              </div>
            )}
            {createMutation.isError && (
              <div className="text-sm text-red-400">Failed to create animation</div>
            )}
          </div>
        </div>
      </div>

      {/* Animation History */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Animation History</h3>
        {animations && animations.items.length > 0 ? (
          <div className="space-y-3">
            {animations.items.map((anim) => (
              <div key={anim.id} className="flex items-center gap-4 bg-slate-800/50 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">{anim.name}</div>
                  <div className="text-xs text-slate-500">
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
                        <a href={`/api/download?path=${encodeURIComponent(anim.output_path)}`}
                          download className="text-xs text-primary hover:underline">Download</a>
                      )}
                    </>
                  )}
                  {anim.status === 'failed' && (
                    <span className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded" title={anim.error}>Failed</span>
                  )}
                  <button onClick={() => deleteMutation.mutate(anim.id)}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-slate-500 py-8">
            No animations yet. Configure settings and generate one above!
          </div>
        )}
      </div>
    </div>
  );
}
