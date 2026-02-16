import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { TagType } from './types';
import { extractArray } from '../../utils/safeData';

export default function TagModal({ frameIds, onClose }: Readonly<{ frameIds: string[]; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const dialogRef = useFocusTrap(onClose);

  useEffect(() => {
    const handler = () => onClose();
    globalThis.addEventListener('close-modal', handler);
    return () => globalThis.removeEventListener('close-modal', handler);
  }, [onClose]);

  const { data: tags } = useQuery<TagType[]>({
    queryKey: ['goes-tags'],
    queryFn: () => api.get('/goes/tags').then((r) => {
      return extractArray(r.data);
    }),
  });

  const tagMutation = useMutation({
    mutationFn: () => api.post('/goes/frames/tag', { frame_ids: frameIds, tag_ids: selectedTags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
      showToast('success', `Tagged ${frameIds.length} frame(s)`);
      onClose();
    },
    onError: () => showToast('error', 'Failed to tag frames'),
  });

  const createTagMutation = useMutation({
    mutationFn: () => api.post('/goes/tags', { name: newTagName, color: newTagColor }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['goes-tags'] });
      setSelectedTags((prev) => [...prev, data.id]);
      showToast('success', `Tag "${newTagName}" created`);
      setNewTagName('');
    },
    onError: () => showToast('error', 'Failed to create tag'),
  });

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      role="dialog"
      onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Escape") onClose(); }}
      onClick={(e: React.MouseEvent) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={dialogRef} aria-label="Tag Frames"
        className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700 w-96 space-y-4 modal-panel"
        aria-hidden="false">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Tag Frames</h3>
          <button onClick={onClose} aria-label="Close tag modal"><X className="w-5 h-5 text-gray-500 dark:text-slate-400" /></button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(tags ?? []).map((t) => (
            <button key={t.id} onClick={() => toggleTag(t.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedTags.includes(t.id)
                  ? 'border-primary bg-primary/20 text-gray-900 dark:text-white'
                  : 'border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
        </div>

        {selectedTags.length > 0 && (
          <button onClick={() => tagMutation.mutate()} disabled={tagMutation.isPending}
            className="w-full px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50">
            {tagMutation.isPending ? 'Tagging...' : `Tag ${frameIds.length} frames`}
          </button>
        )}

        <div className="border-t border-gray-200 dark:border-slate-700 pt-4 space-y-2">
          <label htmlFor="tagmod-create-new-tag" className="text-sm text-gray-500 dark:text-slate-400">Create new tag</label>
          <div className="flex gap-2">
            <input id="tagmod-create-new-tag" type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)}
              className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 cursor-pointer" />
            <input aria-label="Newtagname" type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name" className="flex-1 rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
            <button onClick={() => createTagMutation.mutate()} disabled={!newTagName || createTagMutation.isPending}
              className="px-4 py-2 bg-emerald-600 text-gray-900 dark:text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50">+</button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
