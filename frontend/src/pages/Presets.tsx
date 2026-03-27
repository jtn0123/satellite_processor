import { useState } from 'react';
import { usePresets, useDeletePreset, useRenamePreset } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { BookOpen, Trash2, Pencil, Check, X } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

interface Preset {
  id: string;
  name: string;
  params: Record<string, unknown>;
  created_at: string;
}

export default function PresetsPage() {
  usePageTitle('Presets');
  const { data: presets = [], isLoading } = usePresets();
  const deletePreset = useDeletePreset();
  const renamePreset = useRenamePreset();

  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [deletePresetName, setDeletePresetName] = useState<string | null>(null);

  const handleRename = (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingName(null);
      return;
    }
    renamePreset.mutate(
      { oldName, newName: newName.trim() },
      { onSuccess: () => setEditingName(null) },
    );
  };

  const presetList = presets as Preset[];

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold">Presets</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
            Manage processing presets
          </p>
        </div>
        <div className="space-y-2">
          {['a', 'b', 'c', 'd'].map((k) => (
            <div key={k} className="h-16 skeleton-shimmer rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Presets</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
          Manage saved processing presets
        </p>
      </div>

      {presetList.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No presets yet</p>
          <p className="text-sm mt-1">Create presets from the Process page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {presetList.map((p) => (
            <div
              key={p.id}
              className="card card-hover px-5 py-4 flex items-center gap-4 group"
            >
              <BookOpen className="w-5 h-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                {editingName === p.name ? (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(p.name);
                        if (e.key === 'Escape') setEditingName(null);
                      }}
                      autoFocus
                      className="flex-1 bg-space-700 border border-gray-200 dark:border-space-700/50 rounded-lg px-3 py-1.5 text-sm focus-ring"
                    />
                    <button
                      onClick={() => handleRename(p.name)}
                      disabled={renamePreset.isPending}
                      className="p-2 text-green-400 hover:text-green-300 disabled:opacity-50"
                      aria-label="Confirm rename"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingName(null)}
                      className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                      aria-label="Cancel rename"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                      Created {new Date(p.created_at).toLocaleDateString()} ·{' '}
                      {Object.keys(p.params).length} parameters
                    </p>
                  </>
                )}
              </div>

              {editingName !== p.name && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditingName(p.name);
                      setNewName(p.name);
                    }}
                    className="p-2 hover:bg-space-700 rounded-lg text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                    aria-label={`Rename preset ${p.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletePresetName(p.name)}
                    className="p-2 hover:bg-space-700 rounded-lg text-gray-500 dark:text-slate-400 hover:text-red-400"
                    aria-label={`Delete preset ${p.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {deletePresetName && (
        <ConfirmDialog
          title={`Delete preset "${deletePresetName}"?`}
          message="You can recreate it later."
          confirmLabel="Delete"
          isPending={deletePreset.isPending}
          onConfirm={() => {
            deletePreset.mutate(deletePresetName);
            setDeletePresetName(null);
          }}
          onCancel={() => setDeletePresetName(null)}
        />
      )}
    </div>
  );
}
