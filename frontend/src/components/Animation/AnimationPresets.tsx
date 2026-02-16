import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Trash2, Edit2, Check, X } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import type { AnimationConfig, AnimationPreset } from './types';
import { extractArray } from '../../utils/safeData';

interface Props {
  config: AnimationConfig;
  onLoadPreset: (preset: AnimationPreset) => void;
}

export default function AnimationPresets({ config, onLoadPreset }: Props) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: presets } = useQuery<AnimationPreset[]>({
    queryKey: ['animation-presets'],
    queryFn: () => api.get('/goes/animation-presets').then((r) => extractArray<AnimationPreset>(r.data)),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { start_date: _s, end_date: _e, name: _n, ...presetConfig } = config;
      return api
        .post('/goes/animation-presets', { name: newName || 'Untitled Preset', config: presetConfig })
        .then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animation-presets'] });
      showToast('success', 'Preset saved!');
      setNewName('');
    },
    onError: () => showToast('error', 'Failed to save preset'),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch(`/goes/animation-presets/${id}`, { name }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animation-presets'] });
      setEditingId(null);
      showToast('success', 'Preset renamed');
    },
    onError: () => showToast('error', 'Failed to rename preset'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/animation-presets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animation-presets'] });
      showToast('success', 'Preset deleted');
    },
    onError: () => showToast('error', 'Failed to delete preset'),
  });

  return (
    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
      <h3 className="text-lg font-semibold">Presets</h3>

      {/* Load preset */}
      {presets && presets.length > 0 && (
        <div className="space-y-2">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-3 bg-gray-100/50 dark:bg-slate-800/50 rounded-lg px-4 py-3"
            >
              {editingId === preset.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1"
                    autoFocus
                  />
                  <button
                    onClick={() => renameMutation.mutate({ id: preset.id, name: editName })}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-emerald-400 hover:text-emerald-300"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onLoadPreset(preset)}
                    className="flex-1 text-left text-sm text-gray-900 dark:text-white hover:text-primary transition-colors"
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(preset.id);
                      setEditName(preset.name);
                    }}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-primary transition-colors"
                    aria-label="Rename"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(preset.id)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-red-400 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Save new preset */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Preset name..."
          className="flex-1 min-h-[44px] rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2"
        />
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="min-h-[44px] flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> Save as Preset
        </button>
      </div>
    </div>
  );
}
