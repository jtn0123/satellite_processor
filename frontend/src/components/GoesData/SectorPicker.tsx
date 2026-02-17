import { AlertTriangle } from 'lucide-react';


const SECTOR_DETAILS: Record<string, { description: string }> = {
  FullDisk: { description: 'Entire hemisphere view' },
  CONUS: { description: 'Continental United States' },
  Mesoscale1: { description: 'Storm tracking region 1' },
  Mesoscale2: { description: 'Secondary target region' },
};

interface SectorPickerProps {
  value: string;
  onChange: (sector: string) => void;
  sectors: Array<{ id: string; name: string; cadence_minutes?: number; typical_file_size_kb?: number }>;
  disabled?: boolean;
}

function formatSize(kb: number): string {
  return kb >= 1000 ? `~${(kb / 1000).toFixed(0)} MB` : `~${kb} KB`;
}

export default function SectorPicker({ value, onChange, sectors, disabled }: SectorPickerProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {sectors.map((s) => {
        const selected = value === s.id;
        const detail = SECTOR_DETAILS[s.id];
        const cadence = s.cadence_minutes ?? 10;
        const fileSize = s.typical_file_size_kb ?? 4000;
        const isMeso = s.id.startsWith('Mesoscale');
        const framesPerHour = Math.round(60 / cadence);
        const mbPerHour = ((framesPerHour * fileSize) / 1000).toFixed(0);

        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            disabled={disabled}
            className={`text-left p-4 rounded-xl border transition-all ${
              selected
                ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                : 'border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 hover:border-primary/30'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.name}</span>
              {isMeso && (
                <span className="flex items-center gap-1 text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  High cadence
                </span>
              )}
            </div>
            {detail && (
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-2">{detail.description}</div>
            )}
            <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 dark:text-slate-500">
              <span>Every {cadence} min</span>
              <span>{formatSize(fileSize)}/frame</span>
            </div>
            <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
              1 hour ≈ {framesPerHour} frames (~{mbPerHour} MB)
            </div>
          </button>
        );
      })}
    </div>
  );
}
