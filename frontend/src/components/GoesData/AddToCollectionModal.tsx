import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import api from '../../api/client';
import type { CollectionType } from './types';

export default function AddToCollectionModal({ frameIds, onClose }: Readonly<{ frameIds: string[]; onClose: () => void }>) {
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
          <label htmlFor="addcoll-existing-collection" className="text-sm text-slate-400">Existing collection</label>
          <select id="addcoll-existing-collection" value={selectedCollection} onChange={(e) => setSelectedCollection(e.target.value)}
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
          <label htmlFor="addcoll-or-create-new" className="text-sm text-slate-400">Or create new</label>
          <input id="addcoll-or-create-new" type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
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
