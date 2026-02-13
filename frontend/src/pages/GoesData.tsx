import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Satellite,
  Download,
  Search,
  AlertTriangle,
  CheckCircle,
  Grid3X3,
  List,
  Trash2,
  Tag,
  FolderPlus,
  Play,
  BarChart3,
  Library,
  X,
  ChevronLeft,
  ChevronRight,
  Film,
  Crop,
  Save,
  Sliders,
  Radio,
  Map,
  Layers,
  GitCompare,
} from 'lucide-react';
import api from '../api/client';
import { usePageTitle } from '../hooks/usePageTitle';
import PresetsTab from '../components/GoesData/PresetsTab';
import CleanupTab from '../components/GoesData/CleanupTab';
import LiveTab from '../components/GoesData/LiveTab';
import MapTab from '../components/GoesData/MapTab';
import CompositesTab from '../components/GoesData/CompositesTab';
import ComparisonModal from '../components/GoesData/ComparisonModal';

// ── Types ──────────────────────────────────────────────

interface Product {
  satellites: string[];
  sectors: { id: string; name: string; product: string }[];
  bands: { id: string; description: string }[];
}

interface Gap {
  start: string;
  end: string;
  duration_minutes: number;
  expected_frames: number;
}

interface CoverageStats {
  coverage_percent: number;
  gap_count: number;
  total_frames: number;
  expected_frames: number;
  time_range: { start: string; end: string } | null;
  gaps: Gap[];
}

interface TagType {
  id: string;
  name: string;
  color: string;
}

interface CollectionBrief {
  id: string;
  name: string;
}

interface GoesFrame {
  id: string;
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  file_path: string;
  file_size: number;
  width: number | null;
  height: number | null;
  thumbnail_path: string | null;
  tags: TagType[];
  collections: CollectionBrief[];
}

interface CollectionType {
  id: string;
  name: string;
  description: string;
  frame_count: number;
  created_at: string;
}

interface FrameStats {
  total_frames: number;
  total_size_bytes: number;
  by_satellite: Record<string, { count: number; size: number }>;
  by_band: Record<string, { count: number; size: number }>;
}

interface PaginatedFrames {
  items: GoesFrame[];
  total: number;
  page: number;
  limit: number;
}

interface CropPreset {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  created_at: string;
}

interface AnimationType {
  id: string;
  name: string;
  status: string;
  frame_count: number;
  fps: number;
  format: string;
  quality: string;
  crop_preset_id: string | null;
  false_color: boolean;
  scale: string;
  output_path: string | null;
  file_size: number;
  duration_seconds: number;
  created_at: string;
  completed_at: string | null;
  error: string;
  job_id: string | null;
}

interface PaginatedAnimations {
  items: AnimationType[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ──────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ── Tabs ──────────────────────────────────────────────

type TabId = 'fetch' | 'browse' | 'collections' | 'stats' | 'animation' | 'presets' | 'cleanup' | 'live' | 'map' | 'composites';

export default function GoesData() {
  usePageTitle('GOES Data');
  const [activeTab, setActiveTab] = useState<TabId>('browse');

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'browse', label: 'Browse', icon: <Grid3X3 className="w-4 h-4" /> },
    { id: 'live', label: 'Live', icon: <Radio className="w-4 h-4" /> },
    { id: 'map', label: 'Map', icon: <Map className="w-4 h-4" /> },
    { id: 'composites', label: 'Composites', icon: <Layers className="w-4 h-4" /> },
    { id: 'fetch', label: 'Fetch', icon: <Download className="w-4 h-4" /> },
    { id: 'collections', label: 'Collections', icon: <Library className="w-4 h-4" /> },
    { id: 'animation', label: 'Animation', icon: <Film className="w-4 h-4" /> },
    { id: 'presets', label: 'Presets', icon: <Save className="w-4 h-4" /> },
    { id: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'cleanup', label: 'Cleanup', icon: <Trash2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Satellite className="w-7 h-7 text-primary" />
        <h1 className="text-2xl font-bold">GOES Data</h1>
      </div>

      {/* Tab bar - pill style with overflow scroll on mobile */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1.5 border border-slate-800 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content with fade transition */}
      <div className="animate-fade-in">
        {activeTab === 'fetch' && <FetchTab />}
        {activeTab === 'browse' && <BrowseTab />}
        {activeTab === 'collections' && <CollectionsTab />}
        {activeTab === 'animation' && <AnimationStudioTab />}
        {activeTab === 'presets' && <PresetsTab />}
        {activeTab === 'stats' && <StatsTab />}
        {activeTab === 'cleanup' && <CleanupTab />}
        {activeTab === 'live' && <LiveTab />}
        {activeTab === 'map' && <MapTab />}
        {activeTab === 'composites' && <CompositesTab />}
      </div>
    </div>
  );
}

// ── Fetch Tab (existing functionality) ──────────────────

function FetchTab() {
  const [satellite, setSatellite] = useState('GOES-16');
  const [sector, setSector] = useState('FullDisk');
  const [band, setBand] = useState('C02');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const { data: products, isLoading: productsLoading, isError: productsError } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const {
    data: gaps,
    refetch: refetchGaps,
    isFetching: gapsFetching,
  } = useQuery<CoverageStats>({
    queryKey: ['goes-gaps', satellite, band],
    queryFn: () =>
      api.get('/goes/gaps', { params: { satellite, band, expected_interval: 10 } }).then((r) => r.data),
    enabled: false,
  });

  const fetchMutation = useMutation({
    mutationFn: () =>
      api.post('/goes/fetch', {
        satellite, sector, band,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      }).then((r) => r.data),
  });

  const backfillMutation = useMutation({
    mutationFn: () => api.post('/goes/backfill', { satellite, band, sector }).then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      {productsLoading && <div className="text-sm text-slate-400">Loading products...</div>}
      {productsError && <div className="text-sm text-red-400">Failed to load satellite products</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900 rounded-xl p-6 border border-slate-800">
        <div>
          <label htmlFor="goes-satellite" className="block text-sm font-medium text-slate-400 mb-1">Satellite</label>
          <select id="goes-satellite" value={satellite} onChange={(e) => setSatellite(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2">
            {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="goes-sector" className="block text-sm font-medium text-slate-400 mb-1">Sector</label>
          <select id="goes-sector" value={sector} onChange={(e) => setSector(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2">
            {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="goes-band" className="block text-sm font-medium text-slate-400 mb-1">Band</label>
          <select id="goes-band" value={band} onChange={(e) => setBand(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2">
            {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id} — {b.description}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h2 className="text-lg font-semibold">Fetch Frames</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="goes-start" className="block text-sm font-medium text-slate-400 mb-1">Start Time</label>
            <input type="datetime-local" id="goes-start" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2" />
          </div>
          <div>
            <label htmlFor="goes-end" className="block text-sm font-medium text-slate-400 mb-1">End Time</label>
            <input type="datetime-local" id="goes-end" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => fetchMutation.mutate()} disabled={!startTime || !endTime || fetchMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <Download className="w-4 h-4" />
            {fetchMutation.isPending ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
        {fetchMutation.isSuccess && (
          <div className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Job created: {fetchMutation.data.job_id}
          </div>
        )}
        {fetchMutation.isError && (
          <div className="text-sm text-red-400">
            Failed to create fetch job
            {fetchMutation.error instanceof Error && `: ${fetchMutation.error.message}`}
          </div>
        )}
      </div>

      {/* Gap Detection */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Coverage & Gaps</h2>
          <button onClick={() => refetchGaps()} disabled={gapsFetching}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors">
            <Search className="w-4 h-4" />
            {gapsFetching ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
        {gaps && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { val: `${gaps.coverage_percent}%`, label: 'Coverage', color: 'text-primary' },
                { val: gaps.gap_count, label: 'Gaps', color: 'text-amber-400' },
                { val: gaps.total_frames, label: 'Total Frames', color: 'text-white' },
                { val: gaps.expected_frames, label: 'Expected', color: 'text-slate-400' },
              ].map((s) => (
                <div key={s.label} className="bg-slate-800 rounded-lg p-4">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.val}</div>
                  <div className="text-sm text-slate-400">{s.label}</div>
                </div>
              ))}
            </div>
            {gaps.gaps.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-slate-400">Gap Timeline</h3>
                <div className="h-8 bg-slate-800 rounded-lg overflow-hidden flex relative">
                  {gaps.time_range && (() => {
                    const rangeStart = new Date(gaps.time_range.start).getTime();
                    const rangeEnd = new Date(gaps.time_range.end).getTime();
                    const totalMs = rangeEnd - rangeStart;
                    if (totalMs <= 0) return null;
                    return gaps.gaps.map((gap) => {
                      const gapStart = new Date(gap.start).getTime();
                      const gapEnd = new Date(gap.end).getTime();
                      const left = ((gapStart - rangeStart) / totalMs) * 100;
                      const width = ((gapEnd - gapStart) / totalMs) * 100;
                      return (
                        <div key={gap.start} className="absolute inset-y-0 bg-red-500/60"
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                          title={`${gap.duration_minutes}min gap (${gap.expected_frames} missing frames)`} />
                      );
                    });
                  })()}
                  {gaps.coverage_percent > 0 && <div className="absolute inset-0 bg-emerald-500/20" />}
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {gaps.gaps.map((gap) => (
                    <div key={gap.start} className="flex items-center gap-3 text-sm bg-slate-800/50 rounded px-3 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      <span className="text-slate-300">
                        {new Date(gap.start).toLocaleString()} → {new Date(gap.end).toLocaleString()}
                      </span>
                      <span className="text-slate-500 ml-auto">{gap.duration_minutes}min · {gap.expected_frames} frames</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => backfillMutation.mutate()} disabled={backfillMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-500 disabled:opacity-50 transition-colors">
                  <Download className="w-4 h-4" />
                  {backfillMutation.isPending ? 'Filling...' : 'Fill Gaps'}
                </button>
                {backfillMutation.isSuccess && (
                  <div className="text-sm text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Backfill job created: {backfillMutation.data.job_id}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Frame Preview Modal with Crop Tool ──────────────────

function FramePreviewModal({
  frame,
  onClose,
}: {
  frame: GoesFrame;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  const { data: cropPresets } = useQuery<CropPreset[]>({
    queryKey: ['crop-presets'],
    queryFn: () => api.get('/goes/crop-presets').then((r) => r.data),
  });

  const saveCropPresetMutation = useMutation({
    mutationFn: (data: { name: string; x: number; y: number; width: number; height: number }) =>
      api.post('/goes/crop-presets', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crop-presets'] });
      setShowSavePreset(false);
      setPresetName('');
    },
  });

  // Convert screen coords to image coords
  const screenToImage = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return { x: 0, y: 0 };

    const rect = img.getBoundingClientRect();
    const scaleX = (frame.width || img.naturalWidth) / rect.width;
    const scaleY = (frame.height || img.naturalHeight) / rect.height;
    const x = Math.max(0, Math.round((clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.round((clientY - rect.top) * scaleY));
    return { x, y };
  }, [frame.width, frame.height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = screenToImage(e.clientX, e.clientY);
    setCropStart(pos);
    setCropRect(null);
    setIsDragging(true);
  }, [screenToImage]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !cropStart) return;
    const pos = screenToImage(e.clientX, e.clientY);
    const x = Math.min(cropStart.x, pos.x);
    const y = Math.min(cropStart.y, pos.y);
    const w = Math.abs(pos.x - cropStart.x);
    const h = Math.abs(pos.y - cropStart.y);
    setCropRect({ x, y, w, h });
  }, [isDragging, cropStart, screenToImage]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const applyCropPreset = (preset: CropPreset) => {
    setCropRect({ x: preset.x, y: preset.y, w: preset.width, h: preset.height });
  };

  // Track image dimensions for overlay calculation
  const [imgDims, setImgDims] = useState<{ w: number; h: number; natW: number; natH: number } | null>(null);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    setImgDims({ w: rect.width, h: rect.height, natW: img.naturalWidth, natH: img.naturalHeight });
  }, []);

  // Convert image crop coords to screen overlay position
  const overlayStyle = cropRect && imgDims ? (() => {
    const imgW = frame.width || imgDims.natW;
    const imgH = frame.height || imgDims.natH;
    const scaleX = imgDims.w / imgW;
    const scaleY = imgDims.h / imgH;
    return {
      left: cropRect.x * scaleX,
      top: cropRect.y * scaleY,
      width: cropRect.w * scaleX,
      height: cropRect.h * scaleY,
    };
  })() : undefined;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 rounded-xl border border-slate-700 w-full h-full sm:w-auto sm:h-auto sm:max-w-5xl sm:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-semibold">{frame.satellite} · {frame.band} · {frame.sector}</h3>
            <p className="text-sm text-slate-400">{new Date(frame.capture_time).toLocaleString()} · {formatBytes(frame.file_size)}</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
        </div>

        {/* Image with crop overlay */}
        <div className="flex-1 overflow-auto p-4">
          <div
            ref={containerRef}
            className="relative inline-block cursor-crosshair select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              ref={imgRef}
              src={frame.thumbnail_path
                ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`
                : `/api/download?path=${encodeURIComponent(frame.file_path)}`}
              alt={`${frame.satellite} ${frame.band}`}
              className="max-w-full max-h-[60vh] rounded"
              draggable={false}
              onLoad={handleImageLoad}
            />
            {/* Crop overlay */}
            {overlayStyle && (
              <div
                className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                style={{
                  left: overlayStyle.left,
                  top: overlayStyle.top,
                  width: overlayStyle.width,
                  height: overlayStyle.height,
                }}
              />
            )}
          </div>
        </div>

        {/* Crop controls */}
        <div className="px-6 py-4 border-t border-slate-800 space-y-3">
          {/* Crop coordinates */}
          {cropRect && (
            <div className="flex items-center gap-4 text-sm">
              <Crop className="w-4 h-4 text-primary" />
              <span className="text-slate-300">
                X: <span className="text-white font-mono">{cropRect.x}</span> &nbsp;
                Y: <span className="text-white font-mono">{cropRect.y}</span> &nbsp;
                W: <span className="text-white font-mono">{cropRect.w}</span> &nbsp;
                H: <span className="text-white font-mono">{cropRect.h}</span>
              </span>
              <button
                onClick={() => setShowSavePreset(true)}
                className="flex items-center gap-1 px-3 py-1 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30"
              >
                <Save className="w-3 h-3" /> Save Preset
              </button>
              <button
                onClick={() => setCropRect(null)}
                className="text-xs text-slate-500 hover:text-white"
              >
                Clear
              </button>
            </div>
          )}

          {/* Save preset form */}
          {showSavePreset && cropRect && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Preset name (e.g. San Diego)"
                className="flex-1 rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => saveCropPresetMutation.mutate({
                  name: presetName, x: cropRect.x, y: cropRect.y, width: cropRect.w, height: cropRect.h,
                })}
                disabled={!presetName || saveCropPresetMutation.isPending}
                className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
              >
                {saveCropPresetMutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setShowSavePreset(false)} className="text-xs text-slate-400">Cancel</button>
            </div>
          )}

          {/* Load crop presets */}
          {cropPresets && cropPresets.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Presets:</span>
              {cropPresets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyCropPreset(p)}
                  className="px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition-colors"
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Browse Tab ──────────────────────────────────────────

function BrowseTab() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, setShowProcessModal] = useState(false);
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<GoesFrame | null>(null);
  const [compareFrames, setCompareFrames] = useState<[GoesFrame, GoesFrame] | null>(null);

  // Filters
  const [filterSat, setFilterSat] = useState('');
  const [filterBand, setFilterBand] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState('capture_time');
  const [sortOrder, setSortOrder] = useState('desc');

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => r.data),
  });

  const { data: tags } = useQuery<TagType[]>({
    queryKey: ['goes-tags'],
    queryFn: () => api.get('/goes/tags').then((r) => r.data),
  });

  const params: Record<string, string | number> = { page, limit: 50, sort: sortBy, order: sortOrder };
  if (filterSat) params.satellite = filterSat;
  if (filterBand) params.band = filterBand;
  if (filterSector) params.sector = filterSector;
  if (filterCollection) params.collection_id = filterCollection;
  if (filterTag) params.tag = filterTag;

  const { data: framesData, isLoading } = useQuery<PaginatedFrames>({
    queryKey: ['goes-frames', params],
    queryFn: () => api.get('/goes/frames', { params }).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.delete('/goes/frames', { data: { ids } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
      setSelectedIds(new Set());
    },
  });

  const processMutation = useMutation({
    mutationFn: (frameIds: string[]) =>
      api.post('/goes/frames/process', { frame_ids: frameIds, params: {} }).then((r) => r.data),
    onSuccess: () => setShowProcessModal(false),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFrameClick = (frame: GoesFrame, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(frame.id);
    } else {
      setPreviewFrame(frame);
    }
  };

  const selectAll = () => {
    if (!framesData) return;
    if (selectedIds.size === framesData.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(framesData.items.map((f) => f.id)));
    }
  };

  const totalPages = framesData ? Math.ceil(framesData.total / framesData.limit) : 0;

  return (
    <div className="flex gap-6">
      {/* Filter Sidebar */}
      <div className="w-64 flex-shrink-0 space-y-4">
        <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold text-slate-300">Filters</h3>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Satellite</label>
            <select value={filterSat} onChange={(e) => { setFilterSat(e.target.value); setPage(1); }}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="">All</option>
              {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Band</label>
            <select value={filterBand} onChange={(e) => { setFilterBand(e.target.value); setPage(1); }}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="">All</option>
              {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Sector</label>
            <select value={filterSector} onChange={(e) => { setFilterSector(e.target.value); setPage(1); }}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="">All</option>
              {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Collection</label>
            <select value={filterCollection} onChange={(e) => { setFilterCollection(e.target.value); setPage(1); }}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="">All</option>
              {collections?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Tag</label>
            <select value={filterTag} onChange={(e) => { setFilterTag(e.target.value); setPage(1); }}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="">All</option>
              {tags?.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Sort by</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="capture_time">Capture Time</option>
              <option value="file_size">Size</option>
              <option value="satellite">Satellite</option>
              <option value="created_at">Added</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Order</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
          <div className="flex items-center gap-3">
            <button onClick={selectAll} className="text-xs text-slate-400 hover:text-white transition-colors">
              {selectedIds.size > 0 && framesData && selectedIds.size === framesData.items.length
                ? 'Deselect All'
                : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs text-primary">{selectedIds.size} selected</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <button onClick={() => deleteMutation.mutate([...selectedIds])}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={() => setShowAddToCollection(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors">
                  <FolderPlus className="w-3.5 h-3.5" /> Collection
                </button>
                <button onClick={() => setShowTagModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors">
                  <Tag className="w-3.5 h-3.5" /> Tag
                </button>
                <button onClick={() => processMutation.mutate([...selectedIds])}
                  disabled={processMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors">
                  <Play className="w-3.5 h-3.5" /> Process
                </button>
                {selectedIds.size === 2 && framesData && (
                  <button onClick={() => {
                    const selected = framesData.items.filter((f) => selectedIds.has(f.id));
                    if (selected.length === 2) setCompareFrames([selected[0], selected[1]]);
                  }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 transition-colors">
                    <GitCompare className="w-3.5 h-3.5" /> Compare
                  </button>
                )}
              </>
            )}
            <div className="flex border border-slate-700 rounded-lg overflow-hidden ml-2">
              <button onClick={() => setViewMode('grid')}
                className={`p-1.5 ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')}
                className={`p-1.5 ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Hint */}
        <div className="text-xs text-slate-500">
          {framesData ? `${framesData.total} frames` : 'Loading...'} · Click to preview, Shift+Click to select
        </div>

        {/* Frame grid/list */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
                <div className="aspect-video animate-pulse bg-slate-700 rounded-t" />
                <div className="p-2 space-y-2">
                  <div className="h-3 animate-pulse bg-slate-700 rounded w-3/4" />
                  <div className="h-3 animate-pulse bg-slate-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {framesData?.items.map((frame) => (
              <div key={frame.id}
                onClick={(e) => handleFrameClick(frame, e)}
                className={`relative bg-slate-800 rounded-xl border overflow-hidden cursor-pointer transition-all hover:bg-slate-700 ${
                  selectedIds.has(frame.id) ? 'border-primary ring-1 ring-primary' : 'border-slate-700 hover:border-slate-600'
                }`}>
                <div className="aspect-video bg-slate-800 flex items-center justify-center">
                  {frame.thumbnail_path ? (
                    <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
                      alt={`${frame.satellite} ${frame.band}`}
                      className="w-full h-full object-cover" />
                  ) : (
                    <Satellite className="w-8 h-8 text-slate-600" />
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <div className="text-xs font-medium text-white truncate">
                    {frame.satellite} · {frame.band} · {frame.sector}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(frame.capture_time).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-600">{formatBytes(frame.file_size)}</div>
                  {frame.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {frame.tags.map((t) => (
                        <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-white"
                          style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                {selectedIds.has(frame.id) && (
                  <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {framesData?.items.map((frame) => (
              <div key={frame.id}
                onClick={(e) => handleFrameClick(frame, e)}
                className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  selectedIds.has(frame.id) ? 'bg-primary/10 border border-primary/30' : 'bg-slate-900 border border-slate-800 hover:bg-slate-800/50'
                }`}>
                <div className="w-16 h-10 rounded bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {frame.thumbnail_path ? (
                    <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
                      alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Satellite className="w-4 h-4 text-slate-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{frame.satellite} · {frame.band} · {frame.sector}</div>
                  <div className="text-xs text-slate-500">{new Date(frame.capture_time).toLocaleString()}</div>
                </div>
                <div className="text-xs text-slate-500">{formatBytes(frame.file_size)}</div>
                {frame.width && frame.height && (
                  <div className="text-xs text-slate-600">{frame.width}×{frame.height}</div>
                )}
                <div className="flex gap-1">
                  {frame.tags.map((t) => (
                    <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-white"
                      style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Modals */}
        {showAddToCollection && (
          <AddToCollectionModal frameIds={[...selectedIds]} onClose={() => setShowAddToCollection(false)} />
        )}
        {showTagModal && (
          <TagModal frameIds={[...selectedIds]} onClose={() => setShowTagModal(false)} />
        )}
        {previewFrame && (
          <FramePreviewModal frame={previewFrame} onClose={() => setPreviewFrame(null)} />
        )}
        {compareFrames && (
          <ComparisonModal frameA={compareFrames[0]} frameB={compareFrames[1]} onClose={() => setCompareFrames(null)} />
        )}

        {processMutation.isSuccess && (
          <div className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Processing job created: {processMutation.data.job_id}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add to Collection Modal ──────────────────────────────

function AddToCollectionModal({ frameIds, onClose }: { frameIds: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedCollection, setSelectedCollection] = useState('');
  const [newName, setNewName] = useState('');

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: async (collId: string) => {
      await api.post(`/goes/collections/${collId}/frames`, { frame_ids: frameIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      onClose();
    },
  });

  const createAndAddMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post('/goes/collections', { name: newName });
      await api.post(`/goes/collections/${resp.data.id}/frames`, { frame_ids: frameIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Add to Collection</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-slate-400">Existing collection</label>
          <select value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2">
            <option value="">Select...</option>
            {collections?.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.frame_count})</option>)}
          </select>
          {selectedCollection && (
            <button onClick={() => addMutation.mutate(selectedCollection)}
              disabled={addMutation.isPending}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
              {addMutation.isPending ? 'Adding...' : `Add ${frameIds.length} frames`}
            </button>
          )}
        </div>

        <div className="border-t border-slate-700 pt-4 space-y-2">
          <label className="text-sm text-slate-400">Or create new</label>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name"
            className="w-full rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2" />
          {newName && (
            <button onClick={() => createAndAddMutation.mutate()}
              disabled={createAndAddMutation.isPending}
              className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50">
              {createAndAddMutation.isPending ? 'Creating...' : `Create & Add ${frameIds.length} frames`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tag Modal ──────────────────────────────────────────

function TagModal({ frameIds, onClose }: { frameIds: string[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');

  const { data: tags } = useQuery<TagType[]>({
    queryKey: ['goes-tags'],
    queryFn: () => api.get('/goes/tags').then((r) => r.data),
  });

  const tagMutation = useMutation({
    mutationFn: () => api.post('/goes/frames/tag', { frame_ids: frameIds, tag_ids: selectedTags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
      onClose();
    },
  });

  const createTagMutation = useMutation({
    mutationFn: () => api.post('/goes/tags', { name: newTagName, color: newTagColor }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['goes-tags'] });
      setSelectedTags((prev) => [...prev, data.id]);
      setNewTagName('');
    },
  });

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-700 w-96 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Tag Frames</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags?.map((t) => (
            <button key={t.id} onClick={() => toggleTag(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedTags.includes(t.id)
                  ? 'border-primary bg-primary/20 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-white'
              }`}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
        </div>

        {selectedTags.length > 0 && (
          <button onClick={() => tagMutation.mutate()} disabled={tagMutation.isPending}
            className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {tagMutation.isPending ? 'Tagging...' : `Tag ${frameIds.length} frames`}
          </button>
        )}

        <div className="border-t border-slate-700 pt-4 space-y-2">
          <label className="text-sm text-slate-400">Create new tag</label>
          <div className="flex gap-2">
            <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)}
              className="w-10 h-10 rounded bg-slate-800 border-slate-700 cursor-pointer" />
            <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name" className="flex-1 rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2" />
            <button onClick={() => createTagMutation.mutate()} disabled={!newTagName || createTagMutation.isPending}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50">+</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Animation Studio Tab ──────────────────────────────────

function AnimationStudioTab() {
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
                  <label className="block text-xs text-slate-500 mb-1">Satellite</label>
                  <select value={satellite} onChange={(e) => setSatellite(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Band</label>
                  <select value={band} onChange={(e) => setBand(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Sector</label>
                  <select value={sector} onChange={(e) => setSector(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                    <option value="">All</option>
                    {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Start Date</label>
                  <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">End Date</label>
                  <input type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Collection</label>
                <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}
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
                            alt="" className="w-full h-full object-cover" />
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
              <label className="block text-xs text-slate-500 mb-1">Animation Name</label>
              <input type="text" value={animName} onChange={(e) => setAnimName(e.target.value)}
                placeholder="Untitled Animation"
                className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5" />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">FPS: {fps}</label>
              <input type="range" min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value))}
                className="w-full accent-primary" />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Format</label>
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
              <label className="block text-xs text-slate-500 mb-1">Quality</label>
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
              <label className="block text-xs text-slate-500 mb-1">Crop Preset</label>
              <select value={cropPresetId} onChange={(e) => setCropPresetId(e.target.value)}
                className="w-full rounded bg-slate-800 border-slate-700 text-white text-sm px-2 py-1.5">
                <option value="">None (full frame)</option>
                {cropPresets?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.width}×{p.height})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Scale</label>
              <select value={scale} onChange={(e) => setScale(e.target.value)}
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

// ── Collections Tab ──────────────────────────────────────

function CollectionsTab() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: collections, isLoading } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/goes/collections', { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      setNewName('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/goes/collections/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/collections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goes-collections'] }),
  });

  return (
    <div className="space-y-4">
      {/* Create new */}
      <div className="flex gap-2 bg-slate-900 rounded-xl p-4 border border-slate-800">
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name"
          className="flex-1 rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && newName && createMutation.mutate()} />
        <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
          Create
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections?.map((c) => (
            <div key={c.id} className="bg-slate-900 rounded-xl p-5 border border-slate-800 space-y-3">
              {editingId === c.id ? (
                <div className="flex gap-2">
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded bg-slate-800 border-slate-700 text-white px-2 py-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && updateMutation.mutate({ id: c.id, name: editName })} />
                  <button onClick={() => updateMutation.mutate({ id: c.id, name: editName })}
                    className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-white">{c.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      className="text-xs text-slate-400 hover:text-white">Edit</button>
                    <button onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>{c.frame_count} frames</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
            </div>
          ))}
          {collections?.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-12">
              No collections yet. Create one above!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stats Tab ──────────────────────────────────────────

function StatsTab() {
  const { data: stats, isLoading } = useQuery<FrameStats>({
    queryKey: ['goes-frame-stats'],
    queryFn: () => api.get('/goes/frames/stats').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="text-sm text-slate-400">Loading stats...</div>;
  }

  if (!stats) return null;

  const maxSatSize = Math.max(...Object.values(stats.by_satellite).map((s) => s.size), 1);
  const maxBandCount = Math.max(...Object.values(stats.by_band).map((b) => b.count), 1);

  return (
    <div className="space-y-6">
      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-primary">{stats.total_frames.toLocaleString()}</div>
          <div className="text-sm text-slate-400 mt-1">Total Frames</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-emerald-400">{formatBytes(stats.total_size_bytes)}</div>
          <div className="text-sm text-slate-400 mt-1">Total Storage</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800">
          <div className="text-3xl font-bold text-amber-400">{Object.keys(stats.by_satellite).length}</div>
          <div className="text-sm text-slate-400 mt-1">Satellites</div>
        </div>
      </div>

      {/* Storage by Satellite */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Storage by Satellite</h3>
        <div className="space-y-3">
          {Object.entries(stats.by_satellite).map(([sat, data]) => (
            <div key={sat} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-white">{sat}</span>
                <span className="text-slate-400">{data.count} frames · {formatBytes(data.size)}</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(data.size / maxSatSize) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Frames by Band */}
      <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-lg font-semibold">Frames by Band</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats.by_band).map(([bandKey, data]) => (
            <div key={bandKey} className="bg-slate-800 rounded-lg p-3 space-y-2">
              <div className="text-sm font-medium text-white">{bandKey}</div>
              <div className="text-xl font-bold text-primary">{data.count}</div>
              <div className="text-xs text-slate-500">{formatBytes(data.size)}</div>
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary/60 rounded-full"
                  style={{ width: `${(data.count / maxBandCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
