import { GitCompare, X, Play, Tag, FolderPlus, Trash2, Download } from 'lucide-react';
import type { GoesFrame } from './types';

interface FloatingBatchBarProps {
  selectedFrames: GoesFrame[];
  onCompare: () => void;
  onAnimate: () => void;
  onTag: () => void;
  onAddToCollection: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onClear: () => void;
}

/**
 * Enhanced floating action bar for batch operations.
 * Positioned in thumb-zone at bottom of screen.
 * All touch targets ≥ 44px.
 */
export default function FloatingBatchBar({
  selectedFrames,
  onCompare,
  onAnimate,
  onTag,
  onAddToCollection,
  onDelete,
  onDownload,
  onClear,
}: Readonly<FloatingBatchBarProps>) {
  if (selectedFrames.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-gray-900 dark:bg-slate-800 text-white rounded-2xl px-3 py-2 shadow-2xl border border-gray-700 dark:border-slate-600 animate-fade-in max-w-[95vw] overflow-x-auto">
      <span className="text-sm font-medium mr-1 whitespace-nowrap">
        {selectedFrames.length} selected
      </span>

      {selectedFrames.length === 2 && (
        <button
          onClick={onCompare}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors min-h-[44px] min-w-[44px] whitespace-nowrap"
          aria-label="Compare selected frames"
        >
          <GitCompare className="w-4 h-4" />
          <span className="hidden sm:inline">Compare</span>
        </button>
      )}

      {selectedFrames.length >= 2 && (
        <button
          onClick={onAnimate}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors min-h-[44px] min-w-[44px] whitespace-nowrap"
          aria-label="Animate selected frames"
        >
          <Play className="w-4 h-4" />
          <span className="hidden sm:inline">Animate</span>
        </button>
      )}

      <button
        onClick={onDownload}
        className="flex items-center justify-center px-3 py-2 text-sm hover:bg-white/10 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
        aria-label="Download selected frames"
      >
        <Download className="w-4 h-4" />
      </button>

      <button
        onClick={onTag}
        className="flex items-center justify-center px-3 py-2 text-sm hover:bg-white/10 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
        aria-label="Tag selected frames"
      >
        <Tag className="w-4 h-4" />
      </button>

      <button
        onClick={onAddToCollection}
        className="flex items-center justify-center px-3 py-2 text-sm hover:bg-white/10 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
        aria-label="Add selected to collection"
      >
        <FolderPlus className="w-4 h-4" />
      </button>

      <button
        onClick={onDelete}
        className="flex items-center justify-center px-3 py-2 text-sm text-red-400 hover:bg-red-600/20 rounded-xl transition-colors min-h-[44px] min-w-[44px]"
        aria-label="Delete selected frames"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <button
        onClick={onClear}
        className="flex items-center justify-center p-2 hover:bg-white/10 rounded-xl transition-colors ml-1 min-h-[44px] min-w-[44px]"
        aria-label="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
