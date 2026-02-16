import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { CollectionType } from './types';
import { extractArray } from '../../utils/safeData';

export default function AddToCollectionModal({ frameIds, onClose }: Readonly<{ frameIds: string[]; onClose: () => void }>) {
  const queryClient = useQueryClient();
  const [selectedCollection, setSelectedCollection] = useState('');
  const [newName, setNewName] = useState('');
  const dialogRef = useFocusTrap(onClose);

  useEffect(() => {
    const handler = () => onClose();
    globalThis.addEventListener('close-modal', handler);
    return () => globalThis.removeEventListener('close-modal', handler);
  }, [onClose]);

  const { data: collections } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => {
      return extractArray(r.data);
    }),
  });

  const addMutation = useMutation({
    mutationFn: async (collId: string) => {
      await api.post(`/goes/collections/${collId}/frames`, { frame_ids: frameIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      showToast('success', `Added ${frameIds.length} frame(s) to collection`);
      onClose();
    },
    onError: () => showToast('error', 'Failed to add frames to collection'),
  });

  const createAndAddMutation = useMutation({
    mutationFn: async () => {
      const resp = await api.post('/goes/collections', { name: newName });
      await api.post(`/goes/collections/${resp.data.id}/frames`, { frame_ids: frameIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      showToast('success', `Created "${newName}" and added ${frameIds.length} frame(s)`);
      onClose();
    },
    onError: () => showToast('error', 'Failed to create collection'),
  });

  return (
    <dialog
      open
      className="fixed inset-0 bg-black/30 dark:bg-black/60 flex items-center justify-center z-50 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      
    >
      <button type="button" className="fixed inset-0 w-full h-full bg-transparent cursor-default" onClick={onClose} aria-label="Close modal" />
      <div ref={dialogRef} aria-label="Add to Collection"
        className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-700 w-96 space-y-4 modal-panel"
        aria-hidden="false">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Add to Collection</h3>
          <button onClick={onClose} aria-label="Close collection modal"><X className="w-5 h-5 text-gray-500 dark:text-slate-400" /></button>
        </div>

        <div className="space-y-2">
          <label htmlFor="addcoll-existing-collection" className="text-sm text-gray-500 dark:text-slate-400">Existing collection</label>
          <select id="addcoll-existing-collection" value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2">
            <option value="">Select...</option>
            {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.frame_count ?? 0})</option>)}
          </select>
          {selectedCollection && (
            <button onClick={() => addMutation.mutate(selectedCollection)}
              disabled={addMutation.isPending}
              className="w-full px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50">
              {addMutation.isPending ? 'Adding...' : `Add ${frameIds.length} frames`}
            </button>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-slate-700 pt-4 space-y-2">
          <label htmlFor="addcoll-or-create-new" className="text-sm text-gray-500 dark:text-slate-400">Or create new</label>
          <input id="addcoll-or-create-new" type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="Collection name"
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
          {newName && (
            <button onClick={() => createAndAddMutation.mutate()}
              disabled={createAndAddMutation.isPending}
              className="w-full px-4 py-2 bg-emerald-600 text-gray-900 dark:text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50">
              {createAndAddMutation.isPending ? 'Creating...' : `Create & Add ${frameIds.length} frames`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
