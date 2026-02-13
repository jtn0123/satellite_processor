import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import type { CollectionType } from './types';

export default function CollectionsTab() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: collections, isLoading } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/goes/collections').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/goes/collections', { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      setNewName('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/goes/collections/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/collections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['goes-collections'] }),
  });

  return (
    <div className="space-y-4">
      {/* Create new */}
      <div className="flex gap-2 bg-slate-900 rounded-xl p-4 border border-slate-800">
        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name"
          className="flex-1 rounded-lg bg-slate-800 border-slate-700 text-white px-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && newName && createMutation.mutate()} />
        <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
          Create
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections?.map((c) => (
            <div key={c.id} className="bg-slate-900 rounded-xl p-5 border border-slate-800 space-y-3">
              {editingId === c.id ? (
                <div className="flex gap-2">
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded bg-slate-800 border-slate-700 text-white px-2 py-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && updateMutation.mutate({ id: c.id, name: editName })} />
                  <button onClick={() => updateMutation.mutate({ id: c.id, name: editName })}
                    className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-white">{c.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      className="text-xs text-slate-400 hover:text-white">Edit</button>
                    <button onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>{c.frame_count} frames</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
            </div>
          ))}
          {collections?.length === 0 && (
            <div className="col-span-full text-center text-slate-500 py-12">
              No collections yet. Create one above!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
