import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Download,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronLeft,
  Zap,
  Satellite,
  Save,
  ChevronDown,
} from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import BandPicker from './BandPicker';
import SectorPicker from './SectorPicker';
import FetchProgressBar from './FetchProgressBar';
import type { SatelliteAvailability } from './types';

const PresetsTab = lazy(() => import('./PresetsTab'));

type ImageType = 'single' | 'true_color' | 'natural_color';

interface EnhancedProduct {
  satellites: string[];
  satellite_availability: Record<string, SatelliteAvailability>;
  sectors: Array<{ id: string; name: string; product: string; cadence_minutes?: number; typical_file_size_kb?: number }>;
  bands: Array<{ id: string; description: string; wavelength_um?: number; common_name?: string; category?: string; use_case?: string }>;
  default_satellite: string;
}

interface CatalogEntry {
  scan_time: string;
  size: number;
  key: string;
}

function formatAvailRange(avail: SatelliteAvailability): string {
  const from = new Date(avail.available_from);
  const fromStr = from.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).replace(',', '');
  if (!avail.available_to) return `${fromStr}–present`;
  const to = new Date(avail.available_to);
  const toStr = to.toLocaleDateString('en-US', { year: 'numeric', month: 'short' }).replace(',', '');
  return `${fromStr}–${toStr}`;
}

function isDateInRange(dateStr: string, avail: SatelliteAvailability): boolean {
  if (!dateStr) return true;
  const d = new Date(dateStr).getTime();
  const from = new Date(avail.available_from).getTime();
  if (d < from) return false;
  if (avail.available_to && d > new Date(avail.available_to).getTime()) return false;
  return true;
}

interface FetchPreset {
  id: number;
  name: string;
}

const STEPS = ['Source', 'What', 'When'] as const;

export default function FetchTab() {
  const [step, setStep] = useState(0);
  const [satellite, setSatellite] = useState('GOES-19');
  const [sector, setSector] = useState('FullDisk');
  const [band, setBand] = useState('C02');
  const [imageType, setImageType] = useState<ImageType>('single');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [quickFetching, setQuickFetching] = useState<string | null>(null);

  // Listen for prefill events from other tabs (e.g. LiveTab "Download Latest")
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { satellite?: string; sector?: string; band?: string };
      if (detail.satellite) setSatellite(detail.satellite);
      if (detail.sector) setSector(detail.sector);
      if (detail.band) setBand(detail.band);
    };
    globalThis.addEventListener('fetch-prefill', handler);
    return () => globalThis.removeEventListener('fetch-prefill', handler);
  }, []);

  const { data: products, isLoading: productsLoading } = useQuery<EnhancedProduct>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/goes/products').then((r) => r.data),
  });

  const currentAvail = products?.satellite_availability?.[satellite];
  const dateStr = startTime ? startTime.slice(0, 10) : undefined;

  // Catalog query for Step 3
  const { data: catalogData, isFetching: catalogFetching } = useQuery<CatalogEntry[]>({
    queryKey: ['goes-catalog', satellite, sector, band, dateStr],
    queryFn: () =>
      api.get('/goes/catalog', { params: { satellite, sector, band, date: dateStr } }).then((r) => r.data),
    enabled: step === 2 && !!dateStr,
    staleTime: 300000,
  });

  const dateWarning = useMemo(() => {
    if (!currentAvail) return null;
    if (startTime && !isDateInRange(startTime, currentAvail))
      return `Start time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    if (endTime && !isDateInRange(endTime, currentAvail))
      return `End time is outside ${satellite} availability (${formatAvailRange(currentAvail)})`;
    return null;
  }, [startTime, endTime, currentAvail, satellite]);

  // Estimate
  const sectorInfo = products?.sectors?.find((s) => s.id === sector);
  const cadence = sectorInfo?.cadence_minutes ?? 10;
  const fileSizeKb = sectorInfo?.typical_file_size_kb ?? 4000;
  const bandCount = imageType === 'single' ? 1 : 3;

  const estimate = useMemo(() => {
    if (!startTime || !endTime) return null;
    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
    const durationMin = (endMs - startMs) / 60000;
    if (durationMin <= 0) return null;
    const frames = Math.ceil(durationMin / cadence) * bandCount;
    const sizeMb = ((frames * fileSizeKb) / 1000).toFixed(0);
    return { frames, sizeMb };
  }, [startTime, endTime, cadence, fileSizeKb, bandCount]);

  // Fetch mutations
  const fetchMutation = useMutation({
    mutationFn: () => {
      const ts = (v: string) => (v.includes('Z') || v.includes('+') ? v : v + 'Z');
      if (imageType !== 'single') {
        return api.post('/goes/fetch-composite', {
          satellite, sector, recipe: imageType,
          start_time: ts(startTime), end_time: ts(endTime),
        }).then((r) => r.data);
      }
      return api.post('/goes/fetch', {
        satellite, sector, band,
        start_time: ts(startTime), end_time: ts(endTime),
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      showToast('success', `Fetch job created: ${data.job_id}`);
      setShowConfirm(false);
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: Array<{ msg?: string }> | string } } })?.response?.data?.detail;
      let msg = 'Failed to create fetch job';
      if (Array.isArray(detail)) msg = detail[0]?.msg ?? 'Validation error';
      else if (typeof detail === 'string') msg = detail;
      showToast('error', msg.replace(/^Value error, /i, ''));
      setShowConfirm(false);
    },
  });

  // Fetch presets
  const { data: fetchPresets } = useQuery<FetchPreset[]>({
    queryKey: ['fetch-presets'],
    queryFn: () => api.get('/goes/fetch-presets').then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  const quickFetch = async (label: string, fetches: Array<{ satellite: string; sector: string; band: string; hours: number }>) => {
    setQuickFetching(label);
    try {
      const now = new Date();
      for (const f of fetches) {
        const start = new Date(now.getTime() - f.hours * 3600000);
        await api.post('/goes/fetch', {
          satellite: f.satellite,
          sector: f.sector,
          band: f.band,
          start_time: start.toISOString(),
          end_time: now.toISOString(),
        });
      }
      showToast('success', `Quick fetch started: ${label}`);
    } catch {
      showToast('error', `Failed: ${label}`);
    } finally {
      setQuickFetching(null);
    }
  };

  const runPreset = async (preset: FetchPreset) => {
    setQuickFetching(preset.name);
    try {
      await api.post(`/goes/fetch-presets/${preset.id}/run`);
      showToast('success', `Preset "${preset.name}" started`);
    } catch {
      showToast('error', `Failed to run preset "${preset.name}"`);
    } finally {
      setQuickFetching(null);
    }
  };

  const quickChips = [
    { label: 'CONUS Last Hour', fetches: [{ satellite: 'GOES-19', sector: 'CONUS', band: 'C02', hours: 1 }] },
    { label: 'CONUS Last 6hr', fetches: [{ satellite: 'GOES-19', sector: 'CONUS', band: 'C02', hours: 6 }] },
    { label: 'Full Disk Latest', fetches: [{ satellite: 'GOES-19', sector: 'FullDisk', band: 'C02', hours: 1 }] },
    { label: 'All Bands 1hr', fetches: [
      { satellite: 'GOES-19', sector: 'CONUS', band: 'C01', hours: 1 },
      { satellite: 'GOES-19', sector: 'CONUS', band: 'C02', hours: 1 },
      { satellite: 'GOES-19', sector: 'CONUS', band: 'C03', hours: 1 },
    ]},
  ];

  if (productsLoading) {
    return (
      <div className="space-y-4">
        {['skel-source', 'skel-what', 'skel-when'].map((id) => (
          <div key={id} className="h-24 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Quick Fetch Section */}
      <div className="space-y-3" data-testid="quick-fetch-section">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Quick Fetch
        </h2>
        <div className="flex flex-wrap gap-2">
          {quickChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => quickFetch(chip.label, chip.fetches)}
              disabled={quickFetching !== null}
              data-testid={`quick-chip-${chip.label.toLowerCase().replace(/\s+/g, '-')}`}
              className="bg-primary/10 text-primary border border-primary/20 rounded-full px-4 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
            >
              {quickFetching === chip.label ? 'Fetching...' : chip.label}
            </button>
          ))}
          {Array.isArray(fetchPresets) && fetchPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => runPreset(preset)}
              disabled={quickFetching !== null}
              data-testid={`preset-chip-${preset.id}`}
              className="bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full px-4 py-2 text-sm font-medium hover:bg-violet-500/20 disabled:opacity-50 transition-colors"
            >
              {quickFetching === preset.name ? 'Running...' : preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Fetch Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        data-testid="advanced-fetch-toggle"
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        {showAdvanced ? 'Hide Advanced Fetch' : 'Advanced Fetch'}
      </button>

      {showAdvanced && <>
      {/* Step indicators */}
      <div className="flex items-center justify-center gap-2 px-4">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              (() => {
                if (i === step) return 'bg-primary/20 text-primary border border-primary/30';
                if (i < step) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                return 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700';
              })()
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center rounded-full bg-current/10 text-[10px]">
              {i < step ? '✓' : i + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      {/* Step 1: Satellite */}
      {step === 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Choose Satellite</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(products?.satellites ?? []).map((sat) => {
              const avail = products?.satellite_availability?.[sat];
              const selected = satellite === sat;
              const isActive = avail?.status === 'active';
              return (
                <button
                  key={sat}
                  type="button"
                  onClick={() => setSatellite(sat)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                      : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Satellite className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                      <span className="font-semibold text-gray-900 dark:text-white">{sat}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                      }`}
                    >
                      {isActive ? 'Active' : 'Historical'}
                    </span>
                  </div>
                  {avail && (
                    <>
                      <div className="text-xs text-gray-500 dark:text-slate-400">{avail.description}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                        {formatAvailRange(avail)}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: What to fetch */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">What to Fetch</h2>

          {/* Sector picker */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">Sector</h3>
            <SectorPicker
              value={sector}
              onChange={setSector}
              sectors={products?.sectors ?? []}
              satellite={satellite}
            />
          </div>

          {/* Image type toggle */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">Image Type</h3>
            <div className="flex gap-2">
              {([
                { value: 'single' as const, label: 'Single Band' },
                { value: 'true_color' as const, label: 'True Color' },
                { value: 'natural_color' as const, label: 'Natural Color' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setImageType(opt.value)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    imageType === opt.value
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:border-primary/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {imageType === 'true_color' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Fetches bands C01 + C02 + C03 and composites automatically
              </div>
            )}
            {imageType === 'natural_color' && (
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Fetches bands C02 + C06 + C07 and composites automatically
              </div>
            )}
          </div>

          {/* Band picker — only for single band */}
          {imageType === 'single' && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">Band</h3>
              <BandPicker value={band} onChange={setBand} satellite={satellite} sector={sector} />
            </div>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: When */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">When</h2>

          {currentAvail && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0" />
              {satellite} available: <span className="text-gray-900 dark:text-white font-medium">{formatAvailRange(currentAvail)}</span>
            </div>
          )}

          {/* Quick presets */}
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Last Hour', hours: 1 },
              { label: 'Last 6h', hours: 6 },
              { label: 'Last 12h', hours: 12 },
              { label: 'Last 24h', hours: 24 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const now = new Date();
                  const start = new Date(now.getTime() - preset.hours * 3600000);
                  const fmt = (d: Date) => d.toISOString().slice(0, 16);
                  setStartTime(fmt(start));
                  setEndTime(fmt(now));
                }}
                className="px-4 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary border border-gray-200 dark:border-slate-700 hover:border-primary/30 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="goes-start" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">Start</label>
              <input type="datetime-local" id="goes-start" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
            <div>
              <label htmlFor="goes-end" className="block text-sm font-medium text-gray-500 dark:text-slate-400 mb-1">End</label>
              <input type="datetime-local" id="goes-end" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-2" />
            </div>
          </div>

          {dateWarning && (
            <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {dateWarning}
            </div>
          )}

          {/* Catalog timeline */}
          {catalogFetching && (
            <div className="text-xs text-gray-400 animate-pulse">Loading available frames...</div>
          )}
          {catalogData && catalogData.length > 0 && (
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                {catalogData.length} frames available on S3
              </div>
              <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                {catalogData.slice(0, 100).map((entry) => (
                  <div
                    key={entry.key || entry.scan_time}
                    className="h-full bg-emerald-500/60 border-r border-gray-200 dark:border-slate-700"
                    style={{ width: `${100 / Math.min(catalogData.length, 100)}%` }}
                    title={new Date(entry.scan_time).toLocaleTimeString()}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Estimate */}
          {estimate && (
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-slate-300">
                ~{estimate.frames} frames · ~{estimate.sizeMb} MB
              </div>
              {estimate.frames > 150 && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Large fetch
                </span>
              )}
            </div>
          )}

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={!startTime || !endTime || !!dateWarning}
              className="flex items-center gap-2 px-6 py-2.5 btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Fetch
            </button>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <dialog
          open
          className="fixed inset-0 z-50 flex items-center justify-center bg-transparent p-4 m-0 w-full h-full max-w-none max-h-none [&::backdrop]{bg-black/50}"
          onCancel={() => setShowConfirm(false)}
          onClose={() => setShowConfirm(false)}
          aria-labelledby="confirm-title"
        >
          <button className="fixed inset-0 w-full h-full bg-transparent border-none cursor-default" onClick={() => setShowConfirm(false)} aria-label="Close dialog" tabIndex={-1} />
          <div
            className="relative bg-white dark:bg-slate-900 rounded-xl p-6 max-w-sm w-full space-y-4 border border-gray-200 dark:border-slate-700 mx-auto mt-[30vh]"
          >
            <h3 id="confirm-title" className="text-lg font-semibold text-gray-900 dark:text-white">Confirm Fetch</h3>
            <div className="space-y-2 text-sm text-gray-600 dark:text-slate-300">
              <div><span className="text-gray-400">Satellite:</span> {satellite}</div>
              <div><span className="text-gray-400">Sector:</span> {sector}</div>
              <div><span className="text-gray-400">Type:</span> {imageType === 'single' ? `Single Band (${band})` : imageType.replace('_', ' ')}</div>
              {estimate && (
                <div className="bg-gray-100 dark:bg-slate-800 rounded-lg p-3 mt-2">
                  <div className="font-medium">~{estimate.frames} frames · ~{estimate.sizeMb} MB</div>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => fetchMutation.mutate()}
                disabled={fetchMutation.isPending}
                className="flex-1 px-4 py-2 text-sm btn-primary-mix text-gray-900 dark:text-white rounded-lg disabled:opacity-50 transition-colors"
              >
                {fetchMutation.isPending ? 'Starting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </dialog>
      )}

      </>}

      {/* Progress bar */}
      <FetchProgressBar />

      {/* Saved Presets (collapsible) */}
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPresets((p) => !p)}
          aria-expanded={showPresets}
          aria-controls="presets-panel"
          className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Saved Presets</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showPresets ? 'rotate-180' : ''}`} />
        </button>
        {showPresets && (
          <div id="presets-panel" className="px-6 pb-6 border-t border-gray-200 dark:border-slate-800">
            <Suspense fallback={<div className="h-24 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse mt-4" />}>
              <PresetsTab />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
