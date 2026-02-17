import { GitCompare, X, Play } from 'lucide-react';
import type { GoesFrame } from './types';

interface FloatingCompareBarProps {
  selectedFrames: GoesFrame[];
  onCompare: () => void;
  onAnimate: () => void;
  onClear: () => void;
}

/**
 * Floating action bar shown when frames are selected.
 * Positioned at bottom of screen for thumb-zone accessibility on mobile.
 */
export default function FloatingCompareBar({
  selectedFrames,
  onCompare,
  onAnimate,
  onClear,
}: Readonly<FloatingCompareBarProps>) {
  if (selectedFrames.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900 dark:bg-slate-800 text-white rounded-full px-4 py-2.5 shadow-2xl border border-gray-700 dark:border-slate-600 animate-fade-in">
      <span className="text-sm font-medium mr-1">
        {selectedFrames.length} selected
      </span>

      {selectedFrames.length === 2 && (
        <button
          onClick={onCompare}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 rounded-full transition-colors"
          aria-label="Compare selected frames"
        >
          <GitCompare className="w-4 h-4" />
          Compare
        </button>
      )}

      {selectedFrames.length >= 2 && (
        <button
          onClick={onAnimate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-full transition-colors"
          aria-label="Animate selected frames"
        >
          <Play className="w-4 h-4" />
          Animate
        </button>
      )}

      <button
        onClick={onClear}
        className="p-1.5 hover:bg-white/10 rounded-full transition-colors ml-1"
        aria-label="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
