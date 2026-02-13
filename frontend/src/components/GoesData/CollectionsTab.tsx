import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Library, FileDown } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import type { CollectionType } from './types';
import Skeleton from './Skeleton';
import EmptyState from './EmptyState';

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
      showToast('success', `Collection "${newName}" created`);
    },
    onError: () => showToast('error', 'Failed to create collection'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.put(`/goes/collections/${id}`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      setEditingId(null);
      showToast('success', 'Collection updated');
    },
    onError: () => showToast('error', 'Failed to update collection'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/collections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goes-collections'] });
      showToast('success', 'Collection deleted');
    },
    onError: () => showToast('error', 'Failed to delete collection'),
  });

  return (
    <div className="space-y-4">
      {/* Create new */}
      <div className="flex gap-2 bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-800">
        <input aria-label="Newname" type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name"
          className="flex-1 rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2"
          onKeyDown={(e) => e.key === 'Enter' && newName && createMutation.mutate()} />
        <button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}
          className="px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50">
          Create
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={`coll-skel-${i}`} variant="card" />
          ))}
        </div>
      ) : (
        <div className="@container grid grid-cols-1 @md:grid-cols-2 @lg:grid-cols-3 gap-4">
          {collections?.map((c) => (
            <div key={c.id} className="cv-auto bg-gray-50 dark:bg-slate-900 rounded-xl p-5 border border-gray-200 dark:border-slate-800 space-y-3">
              {editingId === c.id ? (
                <div className="flex gap-2">
                  <input aria-label="Editname" type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-2 py-1 text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && updateMutation.mutate({ id: c.id, name: editName })} />
                  <button onClick={() => updateMutation.mutate({ id: c.id, name: editName })}
                    className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 dark:text-slate-400">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{c.name}</h3>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingId(c.id); setEditName(c.name); }}
                      className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white">Edit</button>
                    <button
                      onClick={() => window.open(`/api/goes/frames/export?collection_id=${c.id}&format=csv`, '_blank')}
                      className="text-xs text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                      aria-label={`Export collection ${c.name}`}
                    >
                      <FileDown className="w-3 h-3 inline" /> Export
                    </button>
                    <button onClick={() => deleteMutation.mutate(c.id)}
                      className="text-xs text-red-400 hover:text-red-300">Delete</button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-slate-400">
                <span>{c.frame_count} frames</span>
                <span>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              {c.description && <p className="text-xs text-gray-400 dark:text-slate-500">{c.description}</p>}
            </div>
          ))}
          {collections?.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={<Library className="w-8 h-8" />}
                title="Create your first collection"
                description="Collections help you organize satellite frames into groups. Use the input above to create one."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
