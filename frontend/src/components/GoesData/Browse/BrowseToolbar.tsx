import { Grid3X3, List, FileDown } from 'lucide-react';
import type { GoesFrame } from '../types';
import DesktopBatchActions from './DesktopBatchActions';

interface BrowseToolbarProps {
  selectedIds: Set<string>;
  frames: GoesFrame[];
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  selectAll: () => void;
  onDelete: (ids: string[]) => void;
  processMutation: { mutate: (ids: string[]) => void; isPending: boolean };
  setCollectionFrameIds: (ids: string[]) => void;
  setShowAddToCollection: (v: boolean) => void;
  setTagFrameIds: (ids: string[]) => void;
  setShowTagModal: (v: boolean) => void;
  setCompareFrames: (v: [GoesFrame, GoesFrame] | null) => void;
  onExport: () => void;
}

export default function BrowseToolbar({
  selectedIds,
  frames,
  viewMode,
  setViewMode,
  selectAll,
  onDelete,
  processMutation,
  setCollectionFrameIds,
  setShowAddToCollection,
  setTagFrameIds,
  setShowTagModal,
  setCompareFrames,
  onExport,
}: Readonly<BrowseToolbarProps>) {
  return (
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
        <DesktopBatchActions
          selectedIds={selectedIds}
          frames={frames}
          onDelete={onDelete}
          processMutation={processMutation}
          setCollectionFrameIds={setCollectionFrameIds}
          setShowAddToCollection={setShowAddToCollection}
          setTagFrameIds={setTagFrameIds}
          setShowTagModal={setShowTagModal}
          setCompareFrames={setCompareFrames}
        />
        <button
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]"
          aria-label="Export frames"
          onClick={onExport}
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
  );
}
