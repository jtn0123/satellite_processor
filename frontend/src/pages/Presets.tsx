import { useState } from 'react';
import { usePresets, useDeletePreset, useRenamePreset } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import { BookOpen, Trash2, Pencil, Check, X } from 'lucide-react';

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
          <p className="text-slate-400 text-sm mt-1">Manage processing presets</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-card rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Presets</h1>
        <p className="text-slate-400 text-sm mt-1">Manage saved processing presets</p>
      </div>

      {presetList.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No presets yet</p>
          <p className="text-sm mt-1">Create presets from the Process page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {presetList.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-subtle rounded-xl px-5 py-4 flex items-center gap-4 group hover:bg-card-hover transition-colors"
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
                      className="flex-1 bg-space-700 border border-subtle rounded-lg px-3 py-1.5 text-sm focus-ring"
                    />
                    <button
                      onClick={() => handleRename(p.name)}
                      className="p-1.5 text-green-400 hover:text-green-300"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingName(null)}
                      className="p-1.5 text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Created {new Date(p.created_at).toLocaleDateString()} · {Object.keys(p.params).length} parameters
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
                    className="p-2 hover:bg-space-700 rounded-lg text-slate-400 hover:text-white"
                    title="Rename"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete preset "${p.name}"?`)) {
                        deletePreset.mutate(p.name);
                      }
                    }}
                    className="p-2 hover:bg-space-700 rounded-lg text-slate-400 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
