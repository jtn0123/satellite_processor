import { useState, useEffect } from 'react';
import { useSettings, useUpdateSettings } from '../hooks/useApi';
import { usePageTitle } from '../hooks/usePageTitle';
import SystemMonitor from '../components/System/SystemMonitor';
import { Save, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  usePageTitle('Settings');
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

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
        {isLoading ? (
          <div className="h-32 animate-pulse bg-slate-700 rounded-lg" />
        ) : (
          <div className="grid gap-4">
            <div>
              <label className="text-sm text-slate-400">Default Output Directory</label>
              <input
                type="text"
                value={(form.output_dir as string) ?? '/data/output'}
                onChange={(e) => setForm({ ...form, output_dir: e.target.value })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400">Max Concurrent Workers</label>
              <input
                type="number"
                min={1}
                max={16}
                value={(form.max_workers as number) ?? 4}
                onChange={(e) => setForm({ ...form, max_workers: Number(e.target.value) })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-slate-400">Default Video Codec</label>
              <select
                value={(form.default_codec as string) ?? 'h264'}
                onChange={(e) => setForm({ ...form, default_codec: e.target.value })}
                className="mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm"
              >
                <option value="h264">H.264</option>
                <option value="hevc">HEVC</option>
                <option value="av1">AV1</option>
              </select>
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
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-opacity ${
                  toast.type === 'success' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'
                }`}
                role="status"
              >
                {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {toast.message}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">System Resources</h2>
        <SystemMonitor />
      </div>
    </div>
  );
}
