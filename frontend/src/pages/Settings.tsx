import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSettings, useUpdateSettings } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import SystemMonitor from '../components/System/SystemMonitor';
import { Save, RefreshCw, CheckCircle2, AlertCircle, HardDrive } from 'lucide-react';
import api from '../api/client';
import { formatBytes } from '../utils/format';

const CleanupTab = lazy(() => import('../components/GoesData/CleanupTab'));

interface StorageBreakdown {
  by_satellite: Record<string, { count: number; size: number }>;
  by_band: Record<string, { count: number; size: number }>;
  total_size: number;
  total_frames: number;
}

function StorageSection() {
  const { data: storage } = useQuery<StorageBreakdown>({
    queryKey: ['goes-storage-breakdown'],
    queryFn: () => api.get('/goes/stats').then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  if (!storage) return null;

  const satEntries = Object.entries(storage.by_satellite ?? {});
  const bandEntries = Object.entries(storage.by_band ?? {});
  const maxSatSize = Math.max(...satEntries.map(([, v]) => v.size), 1);
  const colors = ['bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-emerald-400', 'bg-pink-400'];

  return (
    <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-6 space-y-4 inset-shadow-sm dark:inset-shadow-white/5">
      <div className="flex items-center gap-2">
        <HardDrive className="w-5 h-5 text-emerald-400" />
        <h2 className="text-lg font-semibold">Storage</h2>
        <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">
          {formatBytes(storage.total_size)} · {storage.total_frames.toLocaleString()} frames
        </span>
      </div>

      {satEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">By Satellite</h3>
          {satEntries.map(([sat, info], i) => (
            <div key={sat} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-slate-400 w-20 truncate">{sat}</span>
              <div className="flex-1 h-3 bg-gray-200 dark:bg-space-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors[i % colors.length]}`}
                  style={{ width: `${(info.size / maxSatSize) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 dark:text-slate-500 w-24 text-right">{formatBytes(info.size)} ({info.count})</span>
            </div>
          ))}
        </div>
      )}

      {bandEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300">By Band</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 dark:text-slate-500 border-b border-gray-200 dark:border-slate-700">
                  <th className="py-2 pr-4">Band</th>
                  <th className="py-2 pr-4">Frames</th>
                  <th className="py-2">Size</th>
                </tr>
              </thead>
              <tbody>
                {bandEntries.map(([band, info]) => (
                  <tr key={band} className="border-b border-gray-200 dark:border-slate-700/50">
                    <td className="py-1.5 pr-4 text-gray-600 dark:text-slate-300">{band}</td>
                    <td className="py-1.5 pr-4 text-gray-500 dark:text-slate-400">{info.count.toLocaleString()}</td>
                    <td className="py-1.5 text-gray-500 dark:text-slate-400">{formatBytes(info.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsForm({ settings }: Readonly<{ settings: Record<string, unknown> }>) {
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState<Record<string, unknown>>(settings);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSave = () => {
    updateSettings.mutate(form, {
      onSuccess: () => setToast({ type: 'success', message: 'Settings saved successfully.' }),
      onError: () => setToast({ type: 'error', message: 'Failed to save settings.' }),
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">Application configuration</p>
      </div>

      <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-6 space-y-4 inset-shadow-sm dark:inset-shadow-white/5">
        <h2 className="text-lg font-semibold">Processing Defaults</h2>
        <div className="grid gap-4">
            <div>
              <label htmlFor="false-color" className="text-sm text-gray-500 dark:text-slate-400">Default False Color</label>
              <select
                id="false-color"
                value={(form.default_false_color as string) ?? 'vegetation'}
                onChange={(e) => setForm({ ...form, default_false_color: e.target.value })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="vegetation">Vegetation (NDVI)</option>
                <option value="fire">Fire Detection</option>
                <option value="water_vapor">Water Vapor</option>
                <option value="dust">Dust RGB</option>
                <option value="airmass">Air Mass</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Color composite applied to satellite imagery. Each mode highlights different atmospheric or surface features.</p>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <input
                  id="timestamp-enabled"
                  type="checkbox"
                  checked={(form.timestamp_enabled as boolean) ?? true}
                  onChange={(e) => setForm({ ...form, timestamp_enabled: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="timestamp-enabled" className="text-sm text-gray-500 dark:text-slate-400">Timestamp Enabled</label>
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Burn a date/time overlay onto each frame of the output video.</p>
            </div>
            <div>
              <label htmlFor="timestamp-position" className="text-sm text-gray-500 dark:text-slate-400">Timestamp Position</label>
              <select
                id="timestamp-position"
                value={(form.timestamp_position as string) ?? 'bottom-left'}
                onChange={(e) => setForm({ ...form, timestamp_position: e.target.value })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Corner where the timestamp text appears on video frames.</p>
            </div>
            <div>
              <label htmlFor="video-fps" className="text-sm text-gray-500 dark:text-slate-400">Video FPS</label>
              <input
                id="video-fps"
                type="number"
                min={1}
                max={120}
                value={(form.video_fps as number) ?? 24}
                onChange={(e) => setForm({ ...form, video_fps: Number(e.target.value) })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Frames per second for output video. Higher = smoother but larger file. Range: 1–120, default 24.</p>
            </div>
            <div>
              <label htmlFor="video-codec" className="text-sm text-gray-500 dark:text-slate-400">Video Codec</label>
              <select
                id="video-codec"
                value={(form.video_codec as string) ?? 'h264'}
                onChange={(e) => setForm({ ...form, video_codec: e.target.value })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="h264">H.264</option>
                <option value="hevc">HEVC (H.265)</option>
                <option value="av1">AV1</option>
              </select>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">H.264 is most compatible. HEVC/AV1 offer better compression but slower encoding and limited browser support.</p>
            </div>
            <div>
              <label htmlFor="max-frames" className="text-sm text-gray-500 dark:text-slate-400">Max Frames per Fetch</label>
              <input
                id="max-frames"
                type="number"
                min={50}
                max={1000}
                value={(form.max_frames_per_fetch as number) ?? 200}
                onChange={(e) => setForm({ ...form, max_frames_per_fetch: Number(e.target.value) })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">Maximum number of frames downloaded per fetch job. Range: 50–1000, default 200. Reduce if running low on disk space.</p>
            </div>
            <div>
              <label htmlFor="video-quality" className="text-sm text-gray-500 dark:text-slate-400">Video Quality (CRF)</label>
              <input
                id="video-quality"
                type="number"
                min={0}
                max={51}
                value={(form.video_quality as number) ?? 23}
                onChange={(e) => setForm({ ...form, video_quality: Number(e.target.value) })}
                className="mt-1 w-full bg-gray-200 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">CRF quality: Lower = better quality, higher file size. Range: 0–51, default 23.</p>
            </div>
            <button
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 px-4 py-2 btn-primary-mix text-gray-900 dark:text-white rounded-lg text-sm font-medium w-fit transition-colors disabled:opacity-50"
            >
              {updateSettings.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Settings
            </button>
            {toast && (
              <output
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-opacity ${
                  toast.type === 'success' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}
              >
                {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {toast.message}
              </output>
            )}
          </div>
      </div>

      <StorageSection />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Storage Management</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400">Configure cleanup rules to automatically manage disk space.</p>
        <Suspense fallback={<div className="h-32 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />}>
          <CleanupTab />
        </Suspense>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">System Resources</h2>
        <SystemMonitor />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  usePageTitle('Settings');
  const { data: settings, isLoading } = useSettings();

  if (isLoading) {
    return (
      <div className="space-y-8 max-w-4xl animate-pulse">
        <div>
          <span className="sr-only">Loading settings</span>
          <div className="h-8 w-32 bg-gray-200 dark:bg-slate-700 rounded" />
          <div className="h-4 w-48 bg-gray-200 dark:bg-slate-700 rounded mt-2" />
        </div>
        <div className="bg-gray-100 dark:bg-slate-800 rounded-xl p-6 space-y-4">
          {['name', 'email', 'theme', 'lang'].map((field) => (
            <div key={field} className="space-y-2">
              <div className="h-4 w-24 bg-gray-200 dark:bg-slate-700 rounded" />
              <div className="h-10 w-full bg-gray-200 dark:bg-slate-700 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="bg-red-100 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-6 text-center max-w-md">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Failed to load settings</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Something went wrong while fetching your configuration.</p>
          <button
            onClick={() => globalThis.location.reload()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // key={JSON.stringify(settings)} remounts the form when settings change from server
  return <SettingsForm key={JSON.stringify(settings)} settings={settings as Record<string, unknown>} />;
}
