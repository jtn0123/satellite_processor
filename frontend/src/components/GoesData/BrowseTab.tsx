import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Satellite,
  Grid3X3,
  List,
  Trash2,
  Tag,
  FolderPlus,
  Play,
  CheckCircle,
  GitCompare,
  FileDown,
  Share2,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useDebounce } from '../../hooks/useDebounce';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import type { Product, TagType, GoesFrame, CollectionType, PaginatedFrames } from './types';
import FramePreviewModal from './FramePreviewModal';
import AddToCollectionModal from './AddToCollectionModal';
import TagModal from './TagModal';
import ComparisonModal from './ComparisonModal';
import FloatingBatchBar from './FloatingBatchBar';
import BottomSheet from './BottomSheet';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import EmptyState from './EmptyState';
import FrameCard from './FrameCard';
import { extractArray } from '../../utils/safeData';

const PAGE_LIMIT = 50;

function buildFilterParams(
  sortBy: string,
  sortOrder: string,
  sat: string,
  bandVal: string,
  sector: string,
  collection: string,
  tag: string,
): Record<string, string> {
  const p: Record<string, string> = { sort: sortBy, order: sortOrder };
  if (sat) p.satellite = sat;
  if (bandVal) p.band = bandVal;
  if (sector) p.sector = sector;
  if (collection) p.collection_id = collection;
  if (tag) p.tag = tag;
  return p;
}

export default function BrowseTab() {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddToCollection, setShowAddToCollection] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [tagFrameIds, setTagFrameIds] = useState<string[]>([]);
  const [collectionFrameIds, setCollectionFrameIds] = useState<string[]>([]);
  const [previewFrame, setPreviewFrame] = useState<GoesFrame | null>(null);
  const [compareFrames, setCompareFrames] = useState<[GoesFrame, GoesFrame] | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showBottomSheet, setShowBottomSheet] = useState(false);

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

  const { data: collections, isError: collectionsError } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => extractArray(r.data)),
    retry: 2,
  });

  const { data: tags, isError: tagsError } = useQuery<TagType[]>({
    queryKey: ['goes-tags'],
    queryFn: () => api.get('/goes/tags').then((r) => extractArray(r.data)),
    retry: 2,
  });

  const debouncedSat = useDebounce(filterSat, 300);
  const debouncedBand = useDebounce(filterBand, 300);
  const debouncedSector = useDebounce(filterSector, 300);
  const debouncedCollection = useDebounce(filterCollection, 300);
  const debouncedTag = useDebounce(filterTag, 300);

  const filterParams = useMemo(
    () => buildFilterParams(sortBy, sortOrder, debouncedSat, debouncedBand, debouncedSector, debouncedCollection, debouncedTag),
    [sortBy, sortOrder, debouncedSat, debouncedBand, debouncedSector, debouncedCollection, debouncedTag],
  );

  // Infinite query
  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedFrames>({
    queryKey: ['goes-frames', filterParams],
    queryFn: ({ pageParam }) =>
      api.get('/goes/frames', { params: { ...filterParams, page: pageParam, limit: PAGE_LIMIT } }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil((lastPage.total ?? 0) / (lastPage.limit || PAGE_LIMIT));
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });

  const frames = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  );
  const totalFrames = infiniteData?.pages[0]?.total ?? 0;

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
  }, [queryClient]);

  const { containerRef: pullRef, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: handleRefresh,
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
    onSuccess: (data) => showToast('success', `Processing job created: ${data.job_id}`),
    onError: () => showToast('error', 'Failed to create processing job'),
  });

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFrameClick = useCallback((frame: GoesFrame, e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      toggleSelect(frame.id);
    } else {
      setPreviewFrame(frame);
      globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: 'Frame Preview' }));
    }
  }, [toggleSelect]);

  const handleView = useCallback((frame: GoesFrame) => {
    setPreviewFrame(frame);
    globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: 'Frame Preview' }));
  }, []);

  const handleDownload = useCallback((frame: GoesFrame) => {
    api.get('/download', { params: { path: frame.file_path }, responseType: 'blob' })
      .then((res) => {
        const blob = new Blob([res.data]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = frame.file_path.split('/').pop() ?? 'frame';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => showToast('error', 'Failed to download frame'));
  }, []);

  const handleSingleTag = useCallback((frame: GoesFrame) => {
    setTagFrameIds([frame.id]);
    setShowTagModal(true);
  }, []);

  const handleSingleCollection = useCallback((frame: GoesFrame) => {
    setCollectionFrameIds([frame.id]);
    setShowAddToCollection(true);
  }, []);

  const handleSingleDelete = useCallback((frame: GoesFrame) => {
    if (globalThis.confirm('Are you sure you want to delete this frame? This action cannot be undone.')) {
      deleteMutation.mutate([frame.id]);
    }
  }, [deleteMutation]);

  const handleSingleCompare = useCallback((frame: GoesFrame) => {
    toggleSelect(frame.id);
    showToast('info', 'Select one more frame to compare');
  }, [toggleSelect]);

  const selectAll = () => {
    if (selectedIds.size === frames.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(frames.map((f) => f.id)));
    }
  };

  // #54: Keyboard shortcuts for BrowseTab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        if (globalThis.confirm(`Delete ${selectedIds.size} frame(s)? This action cannot be undone.`)) {
          deleteMutation.mutate([...selectedIds]);
        }
      } else if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }); // intentionally no deps — uses latest state via closure

  const renderFrameGrid = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
            <div key={key} className="bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800 overflow-hidden">
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
    if (frames.length === 0) {
      return (
        <EmptyState
          icon={<Satellite className="w-8 h-8" />}
          title="No frames yet"
          description="Fetch satellite data to start browsing frames. Head over to the Fetch tab to download GOES imagery."
          action={{
            label: 'Go to Fetch Tab',
            onClick: () => globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' })),
          }}
        />
      );
    }
    if (viewMode === 'grid') {
      return (
        <ul aria-label="Satellite frames" className="@container grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-4 gap-3 list-none p-0 m-0">
          {frames.map((frame) => (
            <li key={frame.id} className="cv-auto @container">
              <FrameCard
                frame={frame}
                isSelected={selectedIds.has(frame.id)}
                onClick={handleFrameClick}
                onView={handleView}
                onDownload={handleDownload}
                onCompare={handleSingleCompare}
                onTag={handleSingleTag}
                onAddToCollection={handleSingleCollection}
                onDelete={handleSingleDelete}
                viewMode="grid"
              />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <ul aria-label="Satellite frames" className="space-y-1 list-none p-0 m-0">
        {frames.map((frame) => (
          <li key={frame.id} className="cv-auto-list">
            <FrameCard
              frame={frame}
              isSelected={selectedIds.has(frame.id)}
              onClick={handleFrameClick}
              onView={handleView}
              onDownload={handleDownload}
              onCompare={handleSingleCompare}
              onTag={handleSingleTag}
              onAddToCollection={handleSingleCollection}
              onDelete={handleSingleDelete}
              viewMode="list"
            />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-2">
      {/* Mobile filter toggle — own row above the main flex layout */}
      <div className="md:hidden flex justify-end">
        <button
          onClick={() => setShowBottomSheet(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium text-gray-600 dark:text-slate-300 min-h-[44px]"
          aria-label="Toggle filters"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

    <div className="flex gap-6">

      {/* Desktop filter toggle (hidden) */}
      <button
        onClick={() => setShowMobileFilters(!showMobileFilters)}
        className="hidden"
        aria-label="Toggle desktop filters"
      >
        Filters
      </button>

      {/* Filter Sidebar */}
      <div className={`w-64 shrink-0 space-y-4 ${showMobileFilters ? 'block' : 'hidden'} md:block`}>
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-800 space-y-3 inset-shadow-sm dark:inset-shadow-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-300">Filters</h3>
            {(filterSat || filterBand || filterSector || filterCollection || filterTag) && (
              <button
                onClick={() => { setFilterSat(''); setFilterBand(''); setFilterSector(''); setFilterCollection(''); setFilterTag(''); }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div>
            <label htmlFor="browse-satellite" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Satellite</label>
            <select id="browse-satellite" value={filterSat} onChange={(e) => setFilterSat(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {(products?.satellites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-band" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Band</label>
            <select id="browse-band" value={filterBand} onChange={(e) => setFilterBand(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-sector" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sector</label>
            <select id="browse-sector" value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content">
              <option value="">All</option>
              {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-collection" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Collection</label>
            <select id="browse-collection" value={filterCollection} onChange={(e) => setFilterCollection(e.target.value)}
              className={`w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content${collectionsError ? ' border-red-400' : ''}`}>
              <option value="">{collectionsError ? 'Failed to load' : 'All'}</option>
              {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="browse-tag" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Tag</label>
            <select id="browse-tag" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
              className={`w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content${tagsError ? ' border-red-400' : ''}`}>
              <option value="">{tagsError ? 'Failed to load' : 'All'}</option>
              {(tags ?? []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
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
      <div ref={pullRef} className="flex-1 space-y-4">
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-900 rounded-xl px-4 py-3 border border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <button onClick={selectAll} className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px] px-2">
              {selectedIds.size > 0 && selectedIds.size === frames.length
                ? 'Deselect All'
                : 'Select All'}
            </button>
            {selectedIds.size > 0 && (
              <span className="text-xs text-primary">{selectedIds.size} selected</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Batch action buttons — hidden on mobile where FloatingBatchBar handles them */}
            {selectedIds.size > 0 && (
              <div className="hidden md:contents">
                <button onClick={() => { if (globalThis.confirm(`Delete ${selectedIds.size} frame(s)? This action cannot be undone.`)) deleteMutation.mutate([...selectedIds]); }} aria-label="Delete selected frames"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors min-h-[44px]">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
                <button onClick={() => { setCollectionFrameIds([...selectedIds]); setShowAddToCollection(true); }} aria-label="Add to collection"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]">
                  <FolderPlus className="w-3.5 h-3.5" /> Collection
                </button>
                <button onClick={() => { setTagFrameIds([...selectedIds]); setShowTagModal(true); }} aria-label="Tag selected frames"
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]">
                  <Tag className="w-3.5 h-3.5" /> Tag
                </button>
                <button onClick={() => processMutation.mutate([...selectedIds])}
                  disabled={processMutation.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors min-h-[44px]">
                  <Play className="w-3.5 h-3.5" /> Process
                </button>
                {selectedIds.size === 2 && (
                  <button onClick={() => {
                    const selected = frames.filter((f) => selectedIds.has(f.id));
                    if (selected.length === 2) setCompareFrames([selected[0], selected[1]]);
                  }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 transition-colors min-h-[44px]">
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
                    className="flex items-center gap-1 px-3 py-1.5 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors min-h-[44px]">
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>
                )}
              </div>
            )}
            {/* Export button */}
            <button
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]"
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

            <div className="flex border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden ml-2">
              <button onClick={() => setViewMode('grid')} aria-label="Grid view"
                className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center ${viewMode === 'grid' ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} aria-label="List view"
                className={`p-2 min-w-[44px] min-h-[44px] flex items-center justify-center ${viewMode === 'list' ? 'bg-gray-200 dark:bg-slate-700 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Hint */}
        <div className="text-xs text-gray-400 dark:text-slate-500 min-h-[1.25rem]">
          {infiniteData ? `${totalFrames} frames` : <span className="inline-block h-4 w-16 animate-pulse bg-gray-200 dark:bg-slate-700 rounded align-middle" />} · Click to preview, Shift+Click to select
        </div>

        {/* Frame grid/list */}
        {renderFrameGrid()}

        {/* Infinite scroll sentinel + load more fallback */}
        {hasNextPage && (
          <div ref={sentinelRef} className="flex justify-center py-6">
            {isFetchingNextPage ? (
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-slate-500" />
            ) : (
              <button
                onClick={() => fetchNextPage()}
                className="px-6 py-3 text-sm font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
              >
                Load More
              </button>
            )}
          </div>
        )}

        {/* Modals */}
        {showAddToCollection && (
          <AddToCollectionModal frameIds={collectionFrameIds} onClose={() => setShowAddToCollection(false)} />
        )}
        {showTagModal && (
          <TagModal frameIds={tagFrameIds} onClose={() => setShowTagModal(false)} />
        )}
        {previewFrame && (
          <FramePreviewModal
            frame={previewFrame}
            onClose={() => { setPreviewFrame(null); globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: null })); }}
            allFrames={frames}
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

      {/* Floating batch action bar */}
      <FloatingBatchBar
        selectedFrames={frames.filter((f) => selectedIds.has(f.id))}
        onCompare={() => {
          const selected = frames.filter((f) => selectedIds.has(f.id));
          if (selected.length === 2) setCompareFrames([selected[0], selected[1]]);
        }}
        onAnimate={() => {
          const ids = [...selectedIds];
          globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'animate' }));
          globalThis.dispatchEvent(new CustomEvent('animate-frames', { detail: ids }));
        }}
        onTag={() => { setTagFrameIds([...selectedIds]); setShowTagModal(true); }}
        onAddToCollection={() => { setCollectionFrameIds([...selectedIds]); setShowAddToCollection(true); }}
        onDelete={() => { if (globalThis.confirm(`Delete ${selectedIds.size} frame(s)? This action cannot be undone.`)) deleteMutation.mutate([...selectedIds]); }}
        onDownload={() => {
          frames.filter((f) => selectedIds.has(f.id)).forEach((f) => handleDownload(f));
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Bottom sheet filters for mobile */}
      <BottomSheet open={showBottomSheet} onClose={() => setShowBottomSheet(false)} title="Filters">
        <div className="space-y-4">
          <div>
            <label htmlFor="bs-satellite" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Satellite</label>
            <select id="bs-satellite" value={filterSat} onChange={(e) => setFilterSat(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
              <option value="">All</option>
              {(products?.satellites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bs-band" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Band</label>
            <select id="bs-band" value={filterBand} onChange={(e) => setFilterBand(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
              <option value="">All</option>
              {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bs-sector" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sector</label>
            <select id="bs-sector" value={filterSector} onChange={(e) => setFilterSector(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
              <option value="">All</option>
              {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bs-collection" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Collection</label>
            <select id="bs-collection" value={filterCollection} onChange={(e) => setFilterCollection(e.target.value)}
              className={`w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]${collectionsError ? ' border-red-400' : ''}`}>
              <option value="">{collectionsError ? 'Failed to load' : 'All'}</option>
              {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bs-tag" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Tag</label>
            <select id="bs-tag" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}
              className={`w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]${tagsError ? ' border-red-400' : ''}`}>
              <option value="">{tagsError ? 'Failed to load' : 'All'}</option>
              {(tags ?? []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bs-sort" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sort by</label>
            <select id="bs-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
              <option value="capture_time">Capture Time</option>
              <option value="file_size">Size</option>
              <option value="satellite">Satellite</option>
              <option value="created_at">Added</option>
            </select>
          </div>
          <div>
            <label htmlFor="bs-order" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Order</label>
            <select id="bs-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </select>
          </div>
          <button
            onClick={() => setShowBottomSheet(false)}
            className="w-full py-3 btn-primary-mix text-gray-900 dark:text-white rounded-xl font-medium text-sm min-h-[44px]"
          >
            Apply Filters
          </button>
        </div>
      </BottomSheet>
    </div>
    </div>
  );
}
