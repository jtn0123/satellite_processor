import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Satellite,
  Grid3X3,
  List,
  Trash2,
  Tag,
  FolderPlus,
  Play,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  FileDown,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useDebounce } from '../../hooks/useDebounce';
import type { Product, TagType, GoesFrame, CollectionType, PaginatedFrames } from './types';
import FramePreviewModal from './FramePreviewModal';
import AddToCollectionModal from './AddToCollectionModal';
import TagModal from './TagModal';
import ComparisonModal from './ComparisonModal';
import EmptyState from './EmptyState';
import FrameCard from './FrameCard';

export default function BrowseTab() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [, setShowProcessModal] = useState(false);
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<GoesFrame | null>(null);
  const [compareFrames, setCompareFrames] = useState<[GoesFrame, GoesFrame] | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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

  // Debounce filter values to prevent excessive API calls
  const debouncedSat = useDebounce(filterSat, 300);
  const debouncedBand = useDebounce(filterBand, 300);
  const debouncedSector = useDebounce(filterSector, 300);
  const debouncedCollection = useDebounce(filterCollection, 300);
  const debouncedTag = useDebounce(filterTag, 300);

  const params = useMemo(() => {
    const p: Record<string, string | number> = { page, limit: 50, sort: sortBy, order: sortOrder };
    if (debouncedSat) p.satellite = debouncedSat;
    if (debouncedBand) p.band = debouncedBand;
    if (debouncedSector) p.sector = debouncedSector;
    if (debouncedCollection) p.collection_id = debouncedCollection;
    if (debouncedTag) p.tag = debouncedTag;
    return p;
  }, [page, sortBy, sortOrder, debouncedSat, debouncedBand, debouncedSector, debouncedCollection, debouncedTag]);

  const { data: framesData, isLoading } = useQuery<PaginatedFrames>({
    queryKey: ['goes-frames', params],
    queryFn: () => api.get('/goes/frames', { params }).then((r) => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.delete('/goes/frames', { data: { ids } }),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
      setSelectedIds(new Set());
      showToast('success', `Deleted ${ids.length} frame(s)`);
    },
    onError: () => showToast('error', 'Failed to delete frames'),
  });

  const processMutation = useMutation({
    mutationFn: (frameIds: string[]) =>
      api.post('/goes/frames/process', { frame_ids: frameIds, params: {} }).then((r) => r.data),
    onSuccess: (data) => {
      setShowProcessModal(false);
      showToast('success', `Processing job created: ${data.job_id}`);
    },
    onError: () => showToast('error', 'Failed to create processing job'),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleFrameClick = useCallback((frame: GoesFrame, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(frame.id);
    } else {
      setPreviewFrame(frame);
      globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: 'Frame Preview' }));
    }
  }, []);

  const selectAll = () => {
    if (!framesData) return;
    if (selectedIds.size === framesData.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(framesData.items.map((f) => f.id)));
    }
  };

  const totalPages = framesData ? Math.ceil(framesData.total / framesData.limit) : 0;

  const renderFrameGrid = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`skeleton-${i}`} className="bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 overflow-hidden">
              <div className="aspect-video animate-pulse bg-gray-200 dark:bg-slate-700 rounded-t" />
              <div className="p-2 space-y-2">
                <div className="h-3 animate-pulse bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
                <div className="h-3 animate-pulse bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (!framesData || framesData.items.length === 0) {
      return (
        <EmptyState
          icon={<Satellite className="w-8 h-8" />}
          title="No frames yet"
          description="Fetch satellite data to start browsing frames. Head over to the Fetch tab to download GOES imagery."
          action={{
            label: 'Go to Fetch Tab',
            onClick: () => {
              // Dispatch a custom event that GoesData can listen to for tab switching
              globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' }));
            },
          }}
        />
      );
    }
    if (viewMode === 'grid') {
      return (
        <div className="@container grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-4 gap-3">
          {framesData?.items.map((frame) => (
            <div key={frame.id} className="cv-auto @container">
              <FrameCard frame={frame} isSelected={selectedIds.has(frame.id)} onClick={handleFrameClick} viewMode="grid" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-1">
        {framesData?.items.map((frame) => (
          <div key={frame.id} className="cv-auto-list">
            <FrameCard frame={frame} isSelected={selectedIds.has(frame.id)} onClick={handleFrameClick} viewMode="list" />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex gap-6">
      {/* Mobile filter toggle */}
      <button
        onClick={() => setShowMobileFilters(!showMobileFilters)}
        className="md:hidden flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium text-gray-600 dark:text-slate-300 mb-2 absolute right-4 top-0 z-10"
        aria-label="Toggle filters"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
      </button>

      {/* Filter Sidebar */}
      <div className={`w-64 shrink-0 space-y-4 ${showMobileFilters ? 'block' : 'hidden'} md:block`}>
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-800 space-y-3 inset-shadow-sm dark:inset-shadow-white/5">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-300">Filters</h3>

          <div>
            <label htmlFor="browse-satellite" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Satellite</label>
            <select id="browse-satellite" value={filterSat} onChange={(e) => { setFilterSat(e.target.value); setPage(1); }}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {products?.satellites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-band" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Band</label>
            <select id="browse-band" value={filterBand} onChange={(e) => { setFilterBand(e.target.value); setPage(1); }}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {products?.bands.map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-sector" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sector</label>
            <select id="browse-sector" value={filterSector} onChange={(e) => { setFilterSector(e.target.value); setPage(1); }}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {products?.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-collection" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Collection</label>
            <select id="browse-collection" value={filterCollection} onChange={(e) => { setFilterCollection(e.target.value); setPage(1); }}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {collections?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-tag" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Tag</label>
            <select id="browse-tag" value={filterTag} onChange={(e) => { setFilterTag(e.target.value); setPage(1); }}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {tags?.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-sort" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sort by</label>
            <select id="browse-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="capture_time">Capture Time</option>
              <option value="file_size">Size</option>
              <option value="satellite">Satellite</option>
              <option value="created_at">Added</option>
            </select>
          </div>

          <div>
            <label htmlFor="browse-order" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Order</label>
            <select id="browse-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button onClick={selectAll} className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
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
                <button onClick={() => deleteMutation.mutate([...selectedIds])} aria-label="Delete selected frames"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={() => setShowAddToCollection(true)} aria-label="Add to collection"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
                  <FolderPlus className="w-3.5 h-3.5" /> Collection
                </button>
                <button onClick={() => setShowTagModal(true)} aria-label="Tag selected frames"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors">
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
                {selectedIds.size === 1 && (
                  <button onClick={async () => {
                    const frameId = [...selectedIds][0];
                    try {
                      const res = await api.post(`/goes/frames/${frameId}/share`);
                      const url = `${globalThis.location.origin}${res.data.url}`;
                      await navigator.clipboard.writeText(url);
                      showToast('success', 'Share link copied to clipboard!');
                    } catch {
                      showToast('error', 'Failed to create share link');
                    }
                  }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
              </>
            )}
            {/* Export button */}
            <div className="relative group">
              <button
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                aria-label="Export frames"
                onClick={() => {
                  const exportParams = new URLSearchParams();
                  if (debouncedSat) exportParams.set('satellite', debouncedSat);
                  if (debouncedBand) exportParams.set('band', debouncedBand);
                  if (debouncedSector) exportParams.set('sector', debouncedSector);
                  exportParams.set('format', 'csv');
                  globalThis.open(`/api/goes/frames/export?${exportParams.toString()}`, '_blank');
                }}
              >
                <FileDown className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>

            <div className="flex border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden ml-2">
              <button onClick={() => setViewMode('grid')} aria-label="Grid view"
                className={`p-1.5 ${viewMode === 'grid' ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} aria-label="List view"
                className={`p-1.5 ${viewMode === 'list' ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Hint */}
        <div className="text-xs text-gray-400 dark:text-slate-500">
          {framesData ? `${framesData.total} frames` : <span className="inline-block h-3 w-16 animate-pulse bg-gray-200 dark:bg-slate-700 rounded" />} · Click to preview, Shift+Click to select
        </div>

        {/* Frame grid/list */}
        {renderFrameGrid()}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page"
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-500 dark:text-slate-400">Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} aria-label="Next page"
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors">
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
          <FramePreviewModal
            frame={previewFrame}
            onClose={() => { setPreviewFrame(null); globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: null })); }}
            allFrames={framesData?.items}
            onNavigate={(f) => setPreviewFrame(f)}
          />
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
