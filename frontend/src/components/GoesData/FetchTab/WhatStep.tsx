import { Info, ChevronLeft, ChevronRight } from 'lucide-react';
import BandPicker from '../BandPicker';
import SectorPicker from '../SectorPicker';

type ImageType = 'single' | 'true_color' | 'natural_color';

interface WhatStepProps {
  readonly satellite: string;
  readonly sector: string;
  readonly setSector: (v: string) => void;
  readonly band: string;
  readonly setBand: (v: string) => void;
  readonly imageType: ImageType;
  readonly setImageType: (v: ImageType) => void;
  readonly products: { sectors: Array<{ id: string; name: string; product: string }> } | undefined;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

export function WhatStep({ satellite, sector, setSector, band, setBand, imageType, setImageType, products, onBack, onNext }: WhatStepProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">What to Fetch</h2>

      <div>
        <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">Sector</h3>
        <SectorPicker value={sector} onChange={setSector} sectors={products?.sectors ?? []} satellite={satellite} />
      </div>

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

      {imageType === 'single' && (
        <div>
          <h3 className="text-sm font-medium text-gray-600 dark:text-slate-300 mb-2">Band</h3>
          <BandPicker value={band} onChange={setBand} satellite={satellite} sector={sector} />
        </div>
      )}

      <div className="flex justify-between">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1 px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button type="button" onClick={onNext}
          className="flex items-center gap-1 px-4 py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
