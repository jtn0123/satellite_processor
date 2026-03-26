import { Zap } from 'lucide-react';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { isHimawariSatellite } from '../../../utils/sectorHelpers';

interface FetchPreset {
  id: number;
  name: string;
}

interface QuickFetchChip {
  label: string;
  fetches: { satellite: string; sector: string; band: string; hours: number; recipe?: string }[];
}

interface QuickFetchSectionProps {
  readonly defaultSat: string;
  readonly quickFetching: string | null;
  readonly setQuickFetching: (v: string | null) => void;
  readonly fetchPresets: FetchPreset[] | undefined;
}

function buildGoesChips(defaultSat: string): QuickFetchChip[] {
  return [
    {
      label: 'CONUS Last Hour',
      fetches: [{ satellite: defaultSat, sector: 'CONUS', band: 'C02', hours: 1 }],
    },
    {
      label: 'CONUS Last 6hr',
      fetches: [{ satellite: defaultSat, sector: 'CONUS', band: 'C02', hours: 6 }],
    },
    {
      label: 'Full Disk Latest',
      fetches: [{ satellite: defaultSat, sector: 'FullDisk', band: 'C02', hours: 1 }],
    },
    {
      label: 'All Bands 1hr',
      fetches: [
        { satellite: defaultSat, sector: 'CONUS', band: 'C01', hours: 1 },
        { satellite: defaultSat, sector: 'CONUS', band: 'C02', hours: 1 },
        { satellite: defaultSat, sector: 'CONUS', band: 'C03', hours: 1 },
      ],
    },
  ];
}

function buildHimawariChips(): QuickFetchChip[] {
  return [
    {
      label: '🌏 FLDK B13 Last Hour',
      fetches: [{ satellite: 'Himawari-9', sector: 'FLDK', band: 'B13', hours: 1 }],
    },
    {
      label: '🗾 Japan TrueColor',
      fetches: [
        {
          satellite: 'Himawari-9',
          sector: 'Japan',
          band: 'TrueColor',
          hours: 1,
          recipe: 'true_color',
        },
      ],
    },
    {
      label: '🌏 FLDK TrueColor',
      fetches: [
        {
          satellite: 'Himawari-9',
          sector: 'FLDK',
          band: 'TrueColor',
          hours: 1,
          recipe: 'true_color',
        },
      ],
    },
    {
      label: '🎯 Target B03 Last Hour',
      fetches: [{ satellite: 'Himawari-9', sector: 'Target', band: 'B03', hours: 1 }],
    },
  ];
}

export function QuickFetchSection({
  defaultSat,
  quickFetching,
  setQuickFetching,
  fetchPresets,
}: QuickFetchSectionProps) {
  const goesChips = buildGoesChips(defaultSat);
  const himawariChips = buildHimawariChips();
  const quickChips = [...goesChips, ...himawariChips];

  const quickFetch = async (
    label: string,
    fetches: { satellite: string; sector: string; band: string; hours: number; recipe?: string }[],
  ) => {
    setQuickFetching(label);
    try {
      const now = new Date();
      for (const f of fetches) {
        const start = new Date(now.getTime() - f.hours * 3600000);
        const isComposite =
          f.recipe || (isHimawariSatellite(f.satellite) && f.band === 'TrueColor');
        if (isComposite) {
          await api.post('/satellite/fetch-composite', {
            satellite: f.satellite,
            sector: f.sector,
            recipe: f.recipe ?? 'true_color',
            start_time: start.toISOString(),
            end_time: now.toISOString(),
          });
        } else {
          await api.post('/satellite/fetch', {
            satellite: f.satellite,
            sector: f.sector,
            band: f.band,
            start_time: start.toISOString(),
            end_time: now.toISOString(),
          });
        }
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
      await api.post(`/satellite/fetch-presets/${preset.id}/run`);
      showToast('success', `Preset "${preset.name}" started`);
    } catch {
      showToast('error', `Failed to run preset "${preset.name}"`);
    } finally {
      setQuickFetching(null);
    }
  };

  return (
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
            data-testid={`quick-chip-${chip.label.toLowerCase().replaceAll(/\s+/g, '-')}`}
            className="bg-primary/10 text-primary border border-primary/20 rounded-full px-4 py-2 text-sm font-medium hover:bg-primary/20 disabled:opacity-50 transition-colors"
          >
            {quickFetching === chip.label ? 'Fetching...' : chip.label}
          </button>
        ))}
        {Array.isArray(fetchPresets) &&
          fetchPresets.map((preset) => (
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
  );
}
