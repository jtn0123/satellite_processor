import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Trash2, Edit2, Clock, Save, X } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';

interface FetchPreset {
  id: string;
  name: string;
  satellite: string;
  sector: string;
  band: string;
  description: string;
  created_at: string;
}

interface FetchSchedule {
  id: string;
  name: string;
  preset_id: string;
  interval_minutes: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  preset: FetchPreset | null;
}

export default function PresetsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingPreset, setEditingPreset] = useState<FetchPreset | null>(null);
  const [showScheduleCreate, setShowScheduleCreate] = useState(false);
  const [form, setForm] = useState({ name: '', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '' });
  const [schedForm, setSchedForm] = useState({ name: '', preset_id: '', interval_minutes: 60 });

  const { data: presets = [] } = useQuery<FetchPreset[]>({
    queryKey: ['fetch-presets'],
    queryFn: () => api.get('/goes/fetch-presets').then(r => r.data),
  });

  const { data: schedules = [] } = useQuery<FetchSchedule[]>({
    queryKey: ['fetch-schedules'],
    queryFn: () => api.get('/goes/schedules').then(r => r.data),
  });

  const createPreset = useMutation({
    mutationFn: (data: typeof form) => api.post('/goes/fetch-presets', data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fetch-presets'] }); setShowCreate(false); resetForm(); showToast('success', 'Preset created'); },
    onError: () => showToast('error', 'Failed to create preset'),
  });

  const updatePreset = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<typeof form>) => api.put(`/goes/fetch-presets/${id}`, data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fetch-presets'] }); setEditingPreset(null); showToast('success', 'Preset updated'); },
    onError: () => showToast('error', 'Failed to update preset'),
  });

  const deletePreset = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/fetch-presets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fetch-presets'] }); showToast('success', 'Preset deleted'); },
    onError: () => showToast('error', 'Failed to delete preset'),
  });

  const runPreset = useMutation({
    mutationFn: (id: string) => api.post(`/goes/fetch-presets/${id}/run`).then(r => r.data),
    onSuccess: () => showToast('success', 'Preset fetch job started'),
    onError: () => showToast('error', 'Failed to run preset'),
  });

  const createSchedule = useMutation({
    mutationFn: (data: typeof schedForm) => api.post('/goes/schedules', data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fetch-schedules'] }); setShowScheduleCreate(false); showToast('success', 'Schedule created'); },
    onError: () => showToast('error', 'Failed to create schedule'),
  });

  const toggleSchedule = useMutation({
    mutationFn: (id: string) => api.post(`/goes/schedules/${id}/toggle`).then(r => r.data),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['fetch-schedules'] }); showToast('success', `Schedule ${data.is_active ? 'activated' : 'deactivated'}`); },
    onError: () => showToast('error', 'Failed to toggle schedule'),
  });

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api.delete(`/goes/schedules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fetch-schedules'] }); showToast('success', 'Schedule deleted'); },
    onError: () => showToast('error', 'Failed to delete schedule'),
  });

  const resetForm = () => setForm({ name: '', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '' });

  const intervals = [
    { label: 'Every 1h', value: 60 },
    { label: 'Every 3h', value: 180 },
    { label: 'Every 6h', value: 360 },
    { label: 'Every 12h', value: 720 },
    { label: 'Every 24h', value: 1440 },
  ];

  return (
    <div className="space-y-6">
      {/* Presets Section */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Fetch Presets</h2>
          <button onClick={() => { setShowCreate(true); resetForm(); }} className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80">
            <Plus className="w-4 h-4" /> New Preset
          </button>
        </div>

        {showCreate && (
          <PresetForm form={form} setForm={setForm} onSubmit={() => createPreset.mutate(form)} onCancel={() => setShowCreate(false)} loading={createPreset.isPending} title="Create Preset" />
        )}

        {editingPreset && (
          <PresetForm
            form={{ name: editingPreset.name, satellite: editingPreset.satellite, sector: editingPreset.sector, band: editingPreset.band, description: editingPreset.description }}
            setForm={(f) => setEditingPreset({ ...editingPreset, ...(typeof f === 'function' ? f({ name: editingPreset.name, satellite: editingPreset.satellite, sector: editingPreset.sector, band: editingPreset.band, description: editingPreset.description }) : f) })}
            onSubmit={() => updatePreset.mutate({ id: editingPreset.id, name: editingPreset.name, satellite: editingPreset.satellite, sector: editingPreset.sector, band: editingPreset.band, description: editingPreset.description })}
            onCancel={() => setEditingPreset(null)}
            loading={updatePreset.isPending}
            title="Edit Preset"
          />
        )}

        <div className="space-y-3">
          {presets.length === 0 && <p className="text-gray-400 dark:text-slate-500 text-sm">No presets yet. Create one to save your fetch parameters.</p>}
          {presets.map(preset => (
            <div key={preset.id} className="flex items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-4">
              <div>
                <div className="font-medium">{preset.name}</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">{preset.satellite} · {preset.sector} · {preset.band}</div>
                {preset.description && <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">{preset.description}</div>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => runPreset.mutate(preset.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 rounded-lg text-green-400" title="Run Now">
                  <Play className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingPreset(preset)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 rounded-lg text-gray-500 dark:text-slate-400" title="Edit">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deletePreset.mutate(preset.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 rounded-lg text-red-400" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedules Section */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Clock className="w-5 h-5" /> Schedules</h2>
          <button onClick={() => setShowScheduleCreate(true)} disabled={presets.length === 0}
            className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50">
            <Plus className="w-4 h-4" /> New Schedule
          </button>
        </div>

        {showScheduleCreate && (
          <div className="mb-4 bg-gray-100 dark:bg-slate-800 rounded-lg p-4 space-y-3">
            <input aria-label="Schedule name" placeholder="Schedule name" value={schedForm.name} onChange={e => setSchedForm({ ...schedForm, name: e.target.value })}
              className="w-full rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select aria-label="Schedform" value={schedForm.preset_id} onChange={e => setSchedForm({ ...schedForm, preset_id: e.target.value })}
                className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
                <option value="">Select preset...</option>
                {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select aria-label="Schedform" value={schedForm.interval_minutes} onChange={e => setSchedForm({ ...schedForm, interval_minutes: Number(e.target.value) })}
                className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
                {intervals.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { if (schedForm.name && schedForm.preset_id) createSchedule.mutate(schedForm); }}
                className="px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80" disabled={!schedForm.name || !schedForm.preset_id}>
                <Save className="w-4 h-4 inline mr-1" /> Create
              </button>
              <button onClick={() => setShowScheduleCreate(false)} className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-slate-600">
                <X className="w-4 h-4 inline mr-1" /> Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {schedules.length === 0 && <p className="text-gray-400 dark:text-slate-500 text-sm">No schedules yet. Create a preset first, then schedule it.</p>}
          {schedules.map(sched => (
            <div key={sched.id} className="flex items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-4">
              <div>
                <div className="font-medium">{sched.name}</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  Preset: {sched.preset?.name ?? 'Unknown'} · Every {sched.interval_minutes}min
                </div>
                <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  {sched.last_run_at ? `Last: ${new Date(sched.last_run_at).toLocaleString()}` : 'Never run'}
                  {sched.next_run_at && ` · Next: ${new Date(sched.next_run_at).toLocaleString()}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleSchedule.mutate(sched.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${sched.is_active ? 'bg-green-600 text-gray-900 dark:text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'}`}
                >
                  {sched.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => deleteSchedule.mutate(sched.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 rounded-lg text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PresetForm({ form, setForm, onSubmit, onCancel, loading, title }: {
  form: { name: string; satellite: string; sector: string; band: string; description: string };
  setForm: React.Dispatch<React.SetStateAction<typeof form>>;
  onSubmit: () => void;
  onCancel: () => void;
  loading: boolean;
  title: string;
}) {
  return (
    <div className="mb-4 bg-gray-100 dark:bg-slate-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">{title}</h3>
      <input aria-label="Preset name" placeholder="Preset name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
        className="w-full rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm" />
      <div className="grid grid-cols-3 gap-3">
        <select aria-label="Form" value={form.satellite} onChange={e => setForm(f => ({ ...f, satellite: e.target.value }))}
          className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
          <option value="GOES-16">GOES-16</option>
          <option value="GOES-18">GOES-18</option>
        </select>
        <select aria-label="Form" value={form.sector} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))}
          className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
          <option value="FullDisk">Full Disk</option>
          <option value="CONUS">CONUS</option>
          <option value="Mesoscale-1">Mesoscale-1</option>
          <option value="Mesoscale-2">Mesoscale-2</option>
        </select>
        <select aria-label="Form" value={form.band} onChange={e => setForm(f => ({ ...f, band: e.target.value }))}
          className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
          {['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C16'].map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>
      <input aria-label="Description (optional)" placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
        className="w-full rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={loading || !form.name} className="px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50">
          <Save className="w-4 h-4 inline mr-1" /> {loading ? 'Saving...' : 'Save'}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-slate-600">
          <X className="w-4 h-4 inline mr-1" /> Cancel
        </button>
      </div>
    </div>
  );
}
