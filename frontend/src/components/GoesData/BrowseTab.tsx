import { useState, useCallback, useEffect, useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import type { GoesFrame } from './types';
import FloatingBatchBar from './FloatingBatchBar';
import PullToRefreshIndicator from './PullToRefreshIndicator';
import ConfirmDialog from '../ConfirmDialog';
import { useBrowseFilters } from './Browse/useBrowseFilters';
import { useBrowseData } from './Browse/useBrowseData';
import FilterSidebar from './Browse/FilterSidebar';
import MobileFilterSheet from './Browse/MobileFilterSheet';
import BrowseToolbar from './Browse/BrowseToolbar';
import FrameGridContent from './Browse/FrameGridContent';
import BrowseModals from './Browse/BrowseModals';
import InfiniteScrollSentinel from './Browse/InfiniteScrollSentinel';

// Re-exports for backward compat (tests etc.)
export { default as DesktopBatchActions } from './Browse/DesktopBatchActions';
export { default as InfiniteScrollSentinel } from './Browse/InfiniteScrollSentinel';

export default function BrowseTab() {
  const filters = useBrowseFilters();
  const data = useBrowseData(filters.filterParams);
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
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = data;
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

  const { containerRef: pullRef, isRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: data.handleRefresh,
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
    const a = document.createElement('a');
    a.href = frame.image_url;
    a.download = `${frame.satellite}_${frame.band}_${frame.sector}_${frame.id.slice(0, 8)}.png`;
    a.click();
  }, []);

  const handleExport = useCallback(() => {
    const exportParams = new URLSearchParams();
    if (filters.filterSat) exportParams.set('satellite', filters.filterSat);
    if (filters.filterBand) exportParams.set('band', filters.filterBand);
    if (filters.filterSector) exportParams.set('sector', filters.filterSector);
    exportParams.set('format', 'csv');
    globalThis.open(`/api/satellite/frames/export?${exportParams.toString()}`, '_blank');
  }, [filters.filterSat, filters.filterBand, filters.filterSector]);

  const selectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = prev.size === data.frames.length;
      return allSelected ? new Set() : new Set(data.frames.map((f) => f.id));
    });
  }, [data.frames]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      else if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault();
        setDeleteTargetIds([...selectedIds]);
      } else if (e.key === 'Escape' && selectedIds.size > 0) { setSelectedIds(new Set()); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  // Clear selection and close dialog on delete success
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reset selection after successful delete */
  useEffect(() => {
    if (data.deleteMutation.isSuccess) {
      setSelectedIds(new Set());
      setDeleteTargetIds(null);
    }
  }, [data.deleteMutation.isSuccess]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div className="space-y-2">
      <div className="md:hidden flex justify-end">
        <button onClick={() => setShowBottomSheet(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm font-medium text-gray-600 dark:text-slate-300 min-h-[44px]"
          aria-label="Toggle filters">
          <SlidersHorizontal className="w-4 h-4" /> Filters
        </button>
      </div>

      <div className="flex gap-6">
        <button onClick={() => setShowMobileFilters(!showMobileFilters)} className="hidden" aria-label="Toggle desktop filters">Filters</button>

        <FilterSidebar filters={filters} products={data.products} collections={data.collections} collectionsError={data.collectionsError} tags={data.tags} tagsError={data.tagsError} showMobileFilters={showMobileFilters} />

        <div ref={pullRef} className="flex-1 space-y-4">
          <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

          <BrowseToolbar selectedIds={selectedIds} frames={data.frames} viewMode={viewMode} setViewMode={setViewMode}
            selectAll={selectAll} onDelete={(ids) => setDeleteTargetIds(ids)} processMutation={data.processMutation}
            setCollectionFrameIds={setCollectionFrameIds} setShowAddToCollection={setShowAddToCollection}
            setTagFrameIds={setTagFrameIds} setShowTagModal={setShowTagModal} setCompareFrames={setCompareFrames}
            onExport={handleExport} />

          <div className="text-xs text-gray-400 dark:text-slate-500 min-h-[1.25rem]">
            {data.infiniteData ? `${data.totalFrames} frames` : <span className="inline-block h-4 w-16 animate-pulse bg-gray-200 dark:bg-slate-700 rounded align-middle" />} · Click to preview, Shift+Click to select
          </div>

          <FrameGridContent isLoading={data.isLoading} frames={data.frames} viewMode={viewMode} selectedIds={selectedIds}
            onFrameClick={handleFrameClick} onView={handleView} onDownload={handleDownload}
            onCompare={(f) => { toggleSelect(f.id); showToast('info', 'Select one more frame to compare'); }}
            onTag={(f) => { setTagFrameIds([f.id]); setShowTagModal(true); }}
            onAddToCollection={(f) => { setCollectionFrameIds([f.id]); setShowAddToCollection(true); }}
            onDelete={(f) => { setDeleteTargetIds([f.id]); }} />

          <InfiniteScrollSentinel ref={sentinelRef} hasNextPage={data.hasNextPage} isFetchingNextPage={data.isFetchingNextPage} fetchNextPage={data.fetchNextPage} />

          <BrowseModals showAddToCollection={showAddToCollection} collectionFrameIds={collectionFrameIds}
            onCloseCollection={() => setShowAddToCollection(false)} showTagModal={showTagModal} tagFrameIds={tagFrameIds}
            onCloseTag={() => setShowTagModal(false)} previewFrame={previewFrame}
            onClosePreview={() => { setPreviewFrame(null); globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: null })); }}
            allFrames={data.frames} onNavigatePreview={(f) => setPreviewFrame(f)}
            compareFrames={compareFrames} onCloseCompare={() => setCompareFrames(null)}
            processingJobId={data.processMutation.isSuccess ? data.processMutation.data.job_id : null} />
        </div>

        <FloatingBatchBar selectedFrames={data.frames.filter((f) => selectedIds.has(f.id))}
          onCompare={() => { const sel = data.frames.filter((f) => selectedIds.has(f.id)); if (sel.length === 2) setCompareFrames([sel[0], sel[1]]); }}
          onAnimate={() => { globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'animate' })); globalThis.dispatchEvent(new CustomEvent('animate-frames', { detail: [...selectedIds] })); }}
          onTag={() => { setTagFrameIds([...selectedIds]); setShowTagModal(true); }}
          onAddToCollection={() => { setCollectionFrameIds([...selectedIds]); setShowAddToCollection(true); }}
          onDelete={() => { setDeleteTargetIds([...selectedIds]); }}
          onDownload={() => { data.frames.filter((f) => selectedIds.has(f.id)).forEach((f) => handleDownload(f)); }}
          onClear={() => setSelectedIds(new Set())} />

        <MobileFilterSheet open={showBottomSheet} onClose={() => setShowBottomSheet(false)} filters={filters}
          products={data.products} collections={data.collections} collectionsError={data.collectionsError}
          tags={data.tags} tagsError={data.tagsError} />

        {deleteTargetIds && (
          <ConfirmDialog
            title={deleteTargetIds.length === 1 ? 'Delete 1 frame?' : `Delete ${deleteTargetIds.length} frames?`}
            message="This action cannot be undone."
            confirmLabel="Delete"
            isPending={data.deleteMutation.isPending}
            onConfirm={() => data.deleteMutation.mutate(deleteTargetIds)}
            onCancel={() => setDeleteTargetIds(null)}
          />
        )}
      </div>
    </div>
  );
}
