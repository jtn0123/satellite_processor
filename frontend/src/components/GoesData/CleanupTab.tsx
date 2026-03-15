import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Play, Eye, Save, X, Shield, HardDrive, Satellite } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import { extractArray } from '../../utils/safeData';
import ConfirmDialog from '../ConfirmDialog';

interface CleanupRule {
  id: string;
  name: string;
  rule_type: 'max_age_days' | 'max_storage_gb';
  value: number;
  satellite: string | null;
  protect_collections: boolean;
  is_active: boolean;
  created_at: string;
}

interface CleanupPreview {
  frame_count: number;
  total_size_bytes: number;
  frames: { id: string; file_path: string; file_size: number; capture_time: string }[];
}

interface FrameStats {
  total_frames: number;
  total_size_bytes: number;
  by_satellite: Record<string, { count: number; size: number }>;
  by_band: Record<string, { count: number; size: number }>;
}

interface SectorStats {
  count: number;
  size: number;
  oldest: string | null;
  newest: string | null;
}

interface SatelliteCleanupStats {
  total_frames: number;
  total_size: number;
  sectors: Record<string, SectorStats>;
}

interface CleanupStorageStats {
  total_frames: number;
  total_size: number;
  satellites: Record<string, SatelliteCleanupStats>;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const SATELLITE_COLORS: Record<string, string> = {
  'GOES-16': 'bg-blue-500',
  'GOES-18': 'bg-cyan-500',
  'GOES-19': 'bg-indigo-500',
  'Himawari-9': 'bg-orange-500',
};

function getSatColor(sat: string) {
  return SATELLITE_COLORS[sat] ?? 'bg-gray-500';
}

export default function CleanupTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    rule_type: 'max_age_days' | 'max_storage_gb';
    value: number;
    satellite: string;
    protect_collections: boolean;
  }>({ name: '', rule_type: 'max_age_days', value: 30, satellite: '', protect_collections: true });

  const { data: rules = [] } = useQuery<CleanupRule[]>({
    queryKey: ['cleanup-rules'],
    queryFn: () => api.get('/satellite/cleanup-rules').then(r => {
      return extractArray(r.data);
    }),
  });

  const { data: stats } = useQuery<FrameStats>({
    queryKey: ['goes-frame-stats'],
    queryFn: () => api.get('/satellite/frames/stats').then(r => r.data),
  });

  const { data: storageStats } = useQuery<CleanupStorageStats>({
    queryKey: ['cleanup-storage-stats'],
    queryFn: () => api.get('/satellite/cleanup/stats').then(r => r.data),
  });

  const { data: preview, refetch: refetchPreview, isFetching: previewLoading } = useQuery<CleanupPreview>({
    queryKey: ['cleanup-preview'],
    queryFn: () => api.get('/satellite/cleanup/preview').then(r => r.data),
    enabled: false,
  });

  const createRule = useMutation({
    mutationFn: (data: typeof form) => {
      const payload = { ...data, satellite: data.satellite || null };
      return api.post('/satellite/cleanup-rules', payload).then(r => r.data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cleanup-rules'] }); setShowCreate(false); showToast('success', 'Cleanup rule created'); },
    onError: () => showToast('error', 'Failed to create cleanup rule'),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.delete(`/satellite/cleanup-rules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['cleanup-rules'] }); showToast('success', 'Cleanup rule deleted'); },
    onError: () => showToast('error', 'Failed to delete cleanup rule'),
  });

  const toggleRule = useMutation({
    mutationFn: (rule: CleanupRule) => api.put(`/satellite/cleanup-rules/${rule.id}`, { is_active: !rule.is_active }).then(r => r.data),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['cleanup-rules'] }); showToast('success', `Rule ${data.is_active ? 'activated' : 'deactivated'}`); },
    onError: () => showToast('error', 'Failed to toggle cleanup rule'),
  });

  const runCleanup = useMutation({
    mutationFn: () => api.post('/satellite/cleanup/run').then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['goes-frame-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup-preview'] });
      queryClient.invalidateQueries({ queryKey: ['cleanup-storage-stats'] });
      showToast('success', `Cleaned up ${data.deleted_frames} frames, freed ${formatBytes(data.freed_bytes)}`);
    },
    onError: () => showToast('error', 'Failed to run cleanup'),
  });

  const satellites = storageStats?.satellites ? Object.keys(storageStats.satellites) : [];

  return (
    <div className="space-y-6">
      {/* Storage Overview */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><HardDrive className="w-5 h-5" /> Storage Usage</h2>
        {stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{stats.total_frames}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400">Total Frames</div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{formatBytes(stats.total_size_bytes)}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400">Total Storage</div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{Object.keys(stats.by_satellite ?? {}).length}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400">Satellites</div>
            </div>
            <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3">
              <div className="text-2xl font-bold">{Object.keys(stats.by_band ?? {}).length}</div>
              <div className="text-sm text-gray-500 dark:text-slate-400">Bands</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['frames', 'storage', 'satellites', 'bands'].map((stat) => (
              <div key={`stat-skel-${stat}`} className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3 space-y-2">
                <div className="h-8 w-16 animate-pulse bg-gray-200 dark:bg-slate-700 rounded" />
                <div className="h-4 w-20 animate-pulse bg-gray-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-Satellite Breakdown */}
      {storageStats && satellites.length > 0 && (
        <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Satellite className="w-5 h-5" /> Storage by Satellite</h2>

          {/* Storage bar */}
          {storageStats.total_size > 0 && (
            <div className="mb-4">
              <div className="flex rounded-full h-4 overflow-hidden bg-gray-200 dark:bg-slate-700">
                {satellites.map(sat => {
                  const pct = (storageStats.satellites[sat].total_size / storageStats.total_size) * 100;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={sat}
                      className={`${getSatColor(sat)} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${sat}: ${formatBytes(storageStats.satellites[sat].total_size)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {satellites.map(sat => (
                  <div key={sat} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
                    <span className={`w-2.5 h-2.5 rounded-full ${getSatColor(sat)}`} />
                    {sat}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {satellites.map(sat => {
              const satData = storageStats.satellites[sat];
              const sectors = Object.entries(satData.sectors);
              return (
                <div key={sat} className="bg-gray-100 dark:bg-slate-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-3 h-3 rounded-full ${getSatColor(sat)}`} />
                    <span className="font-semibold">{sat}</span>
                    <span className="ml-auto text-sm text-gray-500 dark:text-slate-400">{formatBytes(satData.total_size)}</span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-slate-300 mb-2">
                    {satData.total_frames.toLocaleString()} frames
                  </div>
                  {sectors.length > 0 && (
                    <div className="space-y-1">
                      {sectors.map(([sector, sectorData]) => (
                        <div key={sector} className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                          <span>{sector}</span>
                          <span>{sectorData.count.toLocaleString()} frames · {formatBytes(sectorData.size)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sectors.length > 0 && sectors[0][1].oldest && (
                    <div className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                      {formatDate(sectors[0][1].oldest)} — {formatDate(sectors[0][1].newest)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cleanup Rules */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Cleanup Rules</h2>
          <div className="flex gap-2">
            <button type="button" onClick={() => refetchPreview()} disabled={previewLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button type="button" onClick={() => setShowCleanupConfirm(true)} disabled={runCleanup.isPending}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600 rounded-lg text-sm font-medium hover:bg-red-500 disabled:opacity-50">
              <Play className="w-4 h-4" /> Run Now
            </button>
            <button type="button" onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80">
              <Plus className="w-4 h-4" /> New Rule
            </button>
          </div>
        </div>

        {runCleanup.isSuccess && (
          <div className="mb-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">
            Cleaned up {runCleanup.data.deleted_frames} frames, freed {formatBytes(runCleanup.data.freed_bytes)}
          </div>
        )}

        {preview && (
          <div className="mb-4 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
            <div className="text-sm text-amber-700 dark:text-amber-300 font-medium">Cleanup Preview</div>
            <div className="text-sm text-amber-600 dark:text-amber-200 mt-1">
              Would delete <strong>{preview.frame_count}</strong> frames ({formatBytes(preview.total_size_bytes)})
            </div>
          </div>
        )}

        {showCreate && (
          <div className="mb-4 bg-gray-100 dark:bg-slate-800 rounded-lg p-4 space-y-3">
            <input aria-label="Rule name" placeholder="Rule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <select aria-label="Form" value={form.rule_type} onChange={e => setForm({ ...form, rule_type: e.target.value as 'max_age_days' | 'max_storage_gb' })}
                className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
                <option value="max_age_days">Max Age (days)</option>
                <option value="max_storage_gb">Max Storage (GB)</option>
              </select>
              <input aria-label="Value" type="number" placeholder="Value" value={form.value} onChange={e => setForm({ ...form, value: Number(e.target.value) })}
                className="rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm" min={0} step={form.rule_type === 'max_storage_gb' ? 0.1 : 1} />
            </div>
            <select aria-label="Satellite filter" value={form.satellite} onChange={e => setForm({ ...form, satellite: e.target.value })}
              className="w-full rounded-lg bg-gray-200 dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white px-3 py-2 text-sm">
              <option value="">All Satellites</option>
              <option value="GOES-16">GOES-16</option>
              <option value="GOES-18">GOES-18</option>
              <option value="GOES-19">GOES-19</option>
              <option value="Himawari-9">Himawari-9</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              <input type="checkbox" checked={form.protect_collections} onChange={e => setForm({ ...form, protect_collections: e.target.checked })}
                className="rounded" />
              <Shield className="w-4 h-4" /> Protect frames in collections
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { if (form.name) createRule.mutate(form); }} disabled={!form.name}
                className="px-3 py-1.5 bg-primary rounded-lg text-sm font-medium hover:bg-primary/80 disabled:opacity-50">
                <Save className="w-4 h-4 inline mr-1" /> Create
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 bg-gray-200 dark:bg-slate-700 rounded-lg text-sm hover:bg-gray-200 dark:hover:bg-slate-600">
                <X className="w-4 h-4 inline mr-1" /> Cancel
              </button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {rules.length === 0 && <p className="text-gray-400 dark:text-slate-500 text-sm">No cleanup rules configured.</p>}
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between bg-gray-100 dark:bg-slate-800 rounded-lg p-4">
              <div>
                <div className="font-medium">{rule.name}</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">
                  {rule.rule_type === 'max_age_days' ? `Delete frames older than ${rule.value} days` : `Keep storage under ${rule.value} GB`}
                  {rule.satellite && <span className="ml-2 text-xs bg-gray-200 dark:bg-slate-600 rounded px-1.5 py-0.5">{rule.satellite}</span>}
                  {!rule.satellite && <span className="ml-2 text-xs text-gray-400 dark:text-slate-500">all satellites</span>}
                  {rule.protect_collections && <span className="ml-2 text-xs text-green-400">🛡 Collections protected</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleRule.mutate(rule)} disabled={toggleRule.isPending}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${rule.is_active ? 'bg-green-600 text-gray-900 dark:text-white' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'} ${toggleRule.isPending ? 'opacity-50' : ''}`}
                  aria-label={`Toggle rule ${rule.name} ${rule.is_active ? 'off' : 'on'}`}>
                  {rule.is_active ? 'Active' : 'Inactive'}
                </button>
                <button onClick={() => deleteRule.mutate(rule.id)} disabled={deleteRule.isPending} className={`p-2 hover:bg-gray-100 dark:hover:bg-slate-600 dark:bg-slate-700 rounded-lg text-red-400 ${deleteRule.isPending ? 'opacity-50' : ''}`} aria-label={`Delete rule ${rule.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCleanupConfirm && (
        <ConfirmDialog
          title="Run cleanup now?"
          message="This will permanently delete frames matching your active rules."
          confirmLabel="Run Cleanup"
          isPending={runCleanup.isPending}
          onConfirm={() => { runCleanup.mutate(); setShowCleanupConfirm(false); }}
          onCancel={() => setShowCleanupConfirm(false)}
          variant="warning"
        />
      )}
    </div>
  );
}
