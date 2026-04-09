import { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { parseApiError } from '../../../utils/parseApiError';
import { ChevronDown, Save } from 'lucide-react';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import {
  isHimawariSatellite,
  getDefaultSector,
  getDefaultBand,
} from '../../../utils/sectorHelpers';

import { defaultDateTimeRange } from '../../ui/dateTimeHelpers';
import { QuickFetchSection } from './QuickFetchSection';
import { SatelliteStep } from './SatelliteStep';
import { WhatStep } from './WhatStep';
import { WhenStep } from './WhenStep';
import { ConfirmDialog } from './ConfirmDialog';

const PresetsTab = lazy(() => import('../PresetsTab'));

type ImageType = 'single' | 'true_color' | 'natural_color';

/**
 * JTN-476 ISSUE-074: the Advanced Fetch wizard used to throw away all
 * selections on a page refresh because state lived purely in component
 * memory. Persist the wizard form + step number to localStorage under a
 * versioned key so a refresh resumes where the user left off, and clear
 * the saved state once the fetch is submitted or the dialog is cancelled.
 *
 * The key carries a version suffix so that incompatible future shapes will
 * be discarded cleanly instead of crashing the restore path.
 */
const WIZARD_STORAGE_KEY = 'advancedFetchWizard.v1';

interface PersistedWizardState {
  showAdvanced: boolean;
  step: number;
  satellite: string;
  sector: string;
  band: string;
  imageType: ImageType;
  startTime: string;
  endTime: string;
}

function loadPersistedWizard(): PersistedWizardState | null {
  if (globalThis.localStorage === undefined) return null;
  try {
    const raw = globalThis.localStorage.getItem(WIZARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedWizardState>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      showAdvanced: !!parsed.showAdvanced,
      step: typeof parsed.step === 'number' ? parsed.step : 0,
      satellite: typeof parsed.satellite === 'string' ? parsed.satellite : '',
      sector: typeof parsed.sector === 'string' ? parsed.sector : 'FullDisk',
      band: typeof parsed.band === 'string' ? parsed.band : 'C02',
      imageType: (parsed.imageType as ImageType) ?? 'single',
      startTime: typeof parsed.startTime === 'string' ? parsed.startTime : '',
      endTime: typeof parsed.endTime === 'string' ? parsed.endTime : '',
    };
  } catch {
    return null;
  }
}

function clearPersistedWizard() {
  if (globalThis.localStorage === undefined) return;
  try {
    globalThis.localStorage.removeItem(WIZARD_STORAGE_KEY);
  } catch {
    // Ignore storage errors (quota, private mode, etc.)
  }
}

interface EnhancedProduct {
  satellites: string[];
  satellite_availability: Record<string, import('../types').SatelliteAvailability>;
  sectors: {
    id: string;
    name: string;
    product: string;
    cadence_minutes?: number;
    typical_file_size_kb?: number;
  }[];
  bands: {
    id: string;
    description: string;
    wavelength_um?: number;
    common_name?: string;
    category?: string;
    use_case?: string;
  }[];
  default_satellite: string;
}

interface FetchPreset {
  id: number;
  name: string;
}

const STEPS = ['Source', 'What', 'When'] as const;

export default function FetchTab() {
  // Default to "now − 1h" → "now" so the native datetime-local picker has
  // a real starting value (not Month=0, Day=0, ...). See JTN-422.
  const initialRange = useMemo(() => defaultDateTimeRange(1), []);
  // Lazy-init from persisted wizard state (JTN-476 ISSUE-074). Null-safe for
  // SSR / tests without localStorage. Falls back to the default range so an
  // empty persisted slot still produces a valid datetime-local value.
  const persisted = useRef<PersistedWizardState | null>(loadPersistedWizard()).current;
  const [step, setStep] = useState(persisted?.step ?? 0);
  const [satellite, setSatellite] = useState(persisted?.satellite ?? '');
  const [sector, setSector] = useState(persisted?.sector ?? 'FullDisk');
  const [band, setBand] = useState(persisted?.band ?? 'C02');
  const [imageType, setImageType] = useState<ImageType>(persisted?.imageType ?? 'single');
  const [startTime, setStartTime] = useState(persisted?.startTime ?? initialRange.start);
  const [endTime, setEndTime] = useState(persisted?.endTime ?? initialRange.end);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(persisted?.showAdvanced ?? false);
  const [quickFetching, setQuickFetching] = useState<string | null>(null);

  // Persist wizard state to localStorage whenever the user changes anything
  // in the wizard. Only persists while the wizard is open — collapsing the
  // wizard also clears the saved state to keep things tidy.
  useEffect(() => {
    if (globalThis.localStorage === undefined) return;
    if (!showAdvanced) {
      // Only keep a snapshot while the wizard is actively in use.
      clearPersistedWizard();
      return;
    }
    try {
      const payload: PersistedWizardState = {
        showAdvanced,
        step,
        satellite,
        sector,
        band,
        imageType,
        startTime,
        endTime,
      };
      globalThis.localStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage may be unavailable (quota, private mode); persistence is
      // best-effort so we swallow the error.
    }
  }, [showAdvanced, step, satellite, sector, band, imageType, startTime, endTime]);

  // Listen for prefill events from other tabs (e.g. LiveTab "Download Latest")
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        satellite?: string;
        sector?: string;
        band?: string;
      };
      if (detail.satellite) setSatellite(detail.satellite);
      if (detail.sector) setSector(detail.sector);
      if (detail.band) setBand(detail.band);
    };
    globalThis.addEventListener('fetch-prefill', handler);
    return () => globalThis.removeEventListener('fetch-prefill', handler);
  }, []);

  const { data: products, isLoading: productsLoading } = useQuery<EnhancedProduct>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
  });

  const defaultSat = products?.default_satellite ?? 'GOES-19';

  useEffect(() => {
    if (products && !satellite) {
      setSatellite(defaultSat);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // When satellite changes, reset sector/band to appropriate defaults
  const handleSatelliteChange = (newSat: string) => {
    setSatellite(newSat);
    setSector(getDefaultSector(newSat));
    const defaultBand = getDefaultBand(newSat);
    // If composite band selected, switch to single band mode appropriate to satellite
    if (defaultBand === 'GEOCOLOR' || defaultBand === 'TrueColor') {
      setBand(isHimawariSatellite(newSat) ? 'B13' : 'C02');
    } else {
      setBand(defaultBand);
    }
  };

  const currentAvail = products?.satellite_availability?.[satellite];
  const sectorInfo = products?.sectors?.find((s) => s.id === sector);

  // Estimate for confirm dialog
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

  const fetchMutation = useMutation({
    mutationFn: () => {
      const ts = (v: string) => (v.includes('Z') || v.includes('+') ? v : v + 'Z');
      if (imageType !== 'single') {
        return api
          .post('/satellite/fetch-composite', {
            satellite,
            sector,
            recipe: imageType,
            start_time: ts(startTime),
            end_time: ts(endTime),
          })
          .then((r) => r.data);
      }
      const fetchPayload: Record<string, string> = {
        satellite,
        sector,
        band,
        start_time: ts(startTime),
        end_time: ts(endTime),
      };
      // Himawari single-band fetches use HSD format
      if (isHimawariSatellite(satellite)) {
        fetchPayload.format = 'hsd';
      }
      return api.post('/satellite/fetch', fetchPayload).then((r) => r.data);
    },
    onSuccess: (data) => {
      showToast('success', `Fetch job created: ${data.job_id}`);
      setShowConfirm(false);
      // JTN-476 ISSUE-074: wipe the persisted wizard after a successful
      // submission so reloading doesn't restore a completed form.
      clearPersistedWizard();
    },
    onError: (err: unknown) => {
      showToast('error', parseApiError(err, 'Failed to create fetch job'));
      setShowConfirm(false);
    },
  });

  const { data: fetchPresets } = useQuery<FetchPreset[]>({
    queryKey: ['fetch-presets'],
    queryFn: () => api.get('/satellite/fetch-presets').then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  if (productsLoading) {
    return (
      <div className="space-y-4">
        {['skel-source', 'skel-what', 'skel-when'].map((id) => (
          <div key={id} className="h-24 skeleton-shimmer rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-16">
      {/* Quick Fetch Section */}
      <QuickFetchSection
        defaultSat={defaultSat}
        quickFetching={quickFetching}
        setQuickFetching={setQuickFetching}
        fetchPresets={fetchPresets}
      />

      {/* Advanced Fetch Toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        data-testid="advanced-fetch-toggle"
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400 hover:text-primary transition-colors"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
        />
        {showAdvanced ? 'Hide Advanced Fetch' : 'Advanced Fetch'}
      </button>

      {showAdvanced && (
        <>
          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2 px-4">
            {STEPS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${(() => {
                  if (i === step) return 'bg-primary/20 text-primary border border-primary/30';
                  if (i < step)
                    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                  return 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700';
                })()}`}
              >
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-current/10 text-[10px]">
                  {i < step ? '✓' : i + 1}
                </span>
                {label}
              </button>
            ))}
          </div>

          {step === 0 && (
            <SatelliteStep
              satellite={satellite}
              setSatellite={handleSatelliteChange}
              products={products}
              onNext={() => setStep(1)}
            />
          )}

          {step === 1 && (
            <WhatStep
              satellite={satellite}
              sector={sector}
              setSector={setSector}
              band={band}
              setBand={setBand}
              imageType={imageType}
              setImageType={setImageType}
              products={products}
              onBack={() => setStep(0)}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <WhenStep
              satellite={satellite}
              sector={sector}
              band={band}
              imageType={imageType}
              startTime={startTime}
              setStartTime={setStartTime}
              endTime={endTime}
              setEndTime={setEndTime}
              currentAvail={currentAvail}
              sectorInfo={sectorInfo}
              onBack={() => setStep(1)}
              onConfirm={() => setShowConfirm(true)}
            />
          )}

          {showConfirm && (
            <ConfirmDialog
              satellite={satellite}
              sector={sector}
              imageType={imageType}
              band={band}
              estimate={estimate}
              isPending={fetchMutation.isPending}
              onConfirm={() => fetchMutation.mutate()}
              onCancel={() => setShowConfirm(false)}
            />
          )}
        </>
      )}

      {/* Saved Presets (collapsible) */}
      <div className="card overflow-hidden">
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
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${showPresets ? 'rotate-180' : ''}`}
          />
        </button>
        {showPresets && (
          <div
            id="presets-panel"
            className="px-6 pb-6 border-t border-gray-200 dark:border-slate-800"
          >
            <Suspense
              fallback={
                <div className="h-24 bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse mt-4" />
              }
            >
              <PresetsTab />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  );
}
