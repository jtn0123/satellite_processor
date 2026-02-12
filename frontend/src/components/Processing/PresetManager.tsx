import { useState } from 'react';
import { usePresets, useCreatePreset, useDeletePreset, useRenamePreset } from '../../hooks/useApi';
import { Save, Trash2, Pencil, Check, X, BookOpen } from 'lucide-react';

interface Preset {
  id: string;
  name: string;
  params: Record<string, unknown>;
  created_at: string;
}

interface Props {
  currentParams: Record<string, unknown>;
  onLoadPreset: (params: Record<string, unknown>) => void;
}

export default function PresetManager({ currentParams, onLoadPreset }: Readonly<Props>) {
  const { data: presets = [] } = usePresets();
  const createPreset = useCreatePreset();
  const deletePreset = useDeletePreset();
  const renamePreset = useRenamePreset();

  const [saveName, setSaveName] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const handleSave = () => {
    if (!saveName.trim()) return;
    createPreset.mutate(
      { name: saveName.trim(), params: currentParams },
      { onSuccess: () => setSaveName('') }
    );
  };

  const handleRename = (oldName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingName(null);
      return;
    }
    renamePreset.mutate(
      { oldName, newName: newName.trim() },
      { onSuccess: () => setEditingName(null) }
    );
  };

  return (
    <div className="bg-card border border-subtle rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Presets</h3>
      </div>

      {/* Save current settings */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Preset name..."
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="flex-1 bg-space-800 border border-subtle rounded-lg px-3 py-2 text-sm focus-ring"
        />
        <button
          onClick={handleSave}
          disabled={!saveName.trim() || createPreset.isPending}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          Save
        </button>
      </div>

      {/* Preset list */}
      {(presets as Preset[]).length > 0 && (
        <div className="space-y-1.5">
          {(presets as Preset[]).map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-space-800 group"
            >
              {editingName === p.name ? (
                <div className="flex-1 flex gap-1.5">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(p.name);
                      if (e.key === 'Escape') setEditingName(null);
                    }}
                    autoFocus
                    className="flex-1 bg-space-700 border border-subtle rounded px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => handleRename(p.name)}
                    className="p-1 text-green-400 hover:text-green-300"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingName(null)}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => onLoadPreset(p.params)}
                    className="flex-1 text-left text-sm text-slate-300 hover:text-white truncate"
                  >
                    {p.name}
                  </button>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingName(p.name);
                        setNewName(p.name);
                      }}
                      className="p-1 text-slate-400 hover:text-white"
                      title="Rename"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (globalThis.confirm(`Delete preset "${p.name}"?`)) {
                          deletePreset.mutate(p.name);
                        }
                      }}
                      className="p-1 text-slate-400 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
