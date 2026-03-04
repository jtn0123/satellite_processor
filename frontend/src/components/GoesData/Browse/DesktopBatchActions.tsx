import { Trash2, Tag, FolderPlus, Play, GitCompare, Share2 } from 'lucide-react';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import type { GoesFrame } from '../types';

interface DesktopBatchActionsProps {
  selectedIds: Set<string>;
  frames: GoesFrame[];
  deleteMutation: { mutate: (ids: string[]) => void };
  processMutation: { mutate: (ids: string[]) => void; isPending: boolean };
  setCollectionFrameIds: (ids: string[]) => void;
  setShowAddToCollection: (v: boolean) => void;
  setTagFrameIds: (ids: string[]) => void;
  setShowTagModal: (v: boolean) => void;
  setCompareFrames: (v: [GoesFrame, GoesFrame] | null) => void;
}

export default function DesktopBatchActions({ selectedIds, frames, deleteMutation, processMutation, setCollectionFrameIds, setShowAddToCollection, setTagFrameIds, setShowTagModal, setCompareFrames }: Readonly<DesktopBatchActionsProps>) {
  if (selectedIds.size === 0) return null;

  return (
    <div className="hidden md:contents">
      <button type="button" onClick={() => { if (globalThis.confirm(`Delete ${selectedIds.size} frame(s)? This action cannot be undone.`)) deleteMutation.mutate([...selectedIds]); }} aria-label="Delete selected frames"
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors min-h-[44px]">
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
      <button type="button" onClick={() => { setCollectionFrameIds([...selectedIds]); setShowAddToCollection(true); }} aria-label="Add to collection"
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]">
        <FolderPlus className="w-3.5 h-3.5" /> Collection
      </button>
      <button type="button" onClick={() => { setTagFrameIds([...selectedIds]); setShowTagModal(true); }} aria-label="Tag selected frames"
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-200 dark:bg-slate-700 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors min-h-[44px]">
        <Tag className="w-3.5 h-3.5" /> Tag
      </button>
      <button type="button" onClick={() => processMutation.mutate([...selectedIds])}
        disabled={processMutation.isPending}
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors min-h-[44px]">
        <Play className="w-3.5 h-3.5" /> Process
      </button>
      {selectedIds.size === 2 && (
        <button type="button" onClick={() => {
          const selected = frames.filter((f) => selectedIds.has(f.id));
          if (selected.length === 2) setCompareFrames([selected[0], selected[1]]);
        }}
          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600/20 text-indigo-400 rounded-lg hover:bg-indigo-600/30 transition-colors min-h-[44px]">
          <GitCompare className="w-3.5 h-3.5" /> Compare
        </button>
      )}
      {selectedIds.size === 1 && (
        <button type="button" onClick={async () => {
          const frameId = [...selectedIds][0];
          try {
            const res = await api.post(`/satellite/frames/${frameId}/share`);
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
  );
}
