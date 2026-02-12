import { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import SystemMonitor from '../components/System/SystemMonitor';
import { Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

function SettingsForm({ settings }: { settings: Record<string, unknown> }) {
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
        <p className="text-slate-400 text-sm mt-1">Application configuration</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Processing Defaults</h2>
        <div className="grid gap-4">
            <div>
              <label htmlFor="false-color" className="text-sm text-slate-400">Default False Color</label>
              <select
                id="false-color"
                value={(form.default_false_color as string) ?? 'vegetation'}
                onChange={(e) => setForm({ ...form, default_false_color: e.target.value })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="vegetation">Vegetation (NDVI)</option>
                <option value="fire">Fire Detection</option>
                <option value="water_vapor">Water Vapor</option>
                <option value="dust">Dust RGB</option>
                <option value="airmass">Air Mass</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Color composite applied to satellite imagery. Each mode highlights different atmospheric or surface features.</p>
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
                <label htmlFor="timestamp-enabled" className="text-sm text-slate-400">Timestamp Enabled</label>
              </div>
              <p className="text-xs text-slate-500 mt-1">Burn a date/time overlay onto each frame of the output video.</p>
            </div>
            <div>
              <label htmlFor="timestamp-position" className="text-sm text-slate-400">Timestamp Position</label>
              <select
                id="timestamp-position"
                value={(form.timestamp_position as string) ?? 'bottom-left'}
                onChange={(e) => setForm({ ...form, timestamp_position: e.target.value })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Corner where the timestamp text appears on video frames.</p>
            </div>
            <div>
              <label htmlFor="video-fps" className="text-sm text-slate-400">Video FPS</label>
              <input
                id="video-fps"
                type="number"
                min={1}
                max={120}
                value={(form.video_fps as number) ?? 24}
                onChange={(e) => setForm({ ...form, video_fps: Number(e.target.value) })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Frames per second for output video. Higher = smoother but larger file. Range: 1–120, default 24.</p>
            </div>
            <div>
              <label htmlFor="video-codec" className="text-sm text-slate-400">Video Codec</label>
              <select
                id="video-codec"
                value={(form.video_codec as string) ?? 'h264'}
                onChange={(e) => setForm({ ...form, video_codec: e.target.value })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="h264">H.264</option>
                <option value="hevc">HEVC (H.265)</option>
                <option value="av1">AV1</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">H.264 is most compatible. HEVC/AV1 offer better compression but slower encoding and limited browser support.</p>
            </div>
            <div>
              <label htmlFor="video-quality" className="text-sm text-slate-400">Video Quality (CRF)</label>
              <input
                id="video-quality"
                type="number"
                min={0}
                max={51}
                value={(form.video_quality as number) ?? 23}
                onChange={(e) => setForm({ ...form, video_quality: Number(e.target.value) })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">CRF quality: Lower = better quality, higher file size. Range: 0–51, default 23.</p>
            </div>
            <button
              onClick={handleSave}
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium w-fit transition-colors disabled:opacity-50"
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
    return <div className="text-center py-12 text-slate-400">Loading settings...</div>;
  }

  if (!settings) {
    return <div className="text-center py-12 text-slate-400">Failed to load settings</div>;
  }

  // key={JSON.stringify(settings)} remounts the form when settings change from server
  return <SettingsForm key={JSON.stringify(settings)} settings={settings as Record<string, unknown>} />;
}
