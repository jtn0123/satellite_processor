import { Satellite, ChevronRight } from 'lucide-react';
import type { SatelliteAvailability } from '../types';
import { formatAvailRange } from './fetchUtils';

interface EnhancedProduct {
  satellites: string[];
  satellite_availability: Record<string, SatelliteAvailability>;
}

interface SatelliteStepProps {
  readonly satellite: string;
  readonly setSatellite: (v: string) => void;
  readonly products: EnhancedProduct | undefined;
  readonly onNext: () => void;
}

export function SatelliteStep({ satellite, setSatellite, products, onNext }: SatelliteStepProps) {
  return (
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
          onClick={onNext}
          className="flex items-center gap-1 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
