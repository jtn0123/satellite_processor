import { Satellite, Film } from 'lucide-react';
import Image from '../../Image';
import { BAND_INFO, HIMAWARI_BAND_INFO } from '../../../constants/bands';
import { isHimawariSatellite } from '../../../utils/sectorHelpers';
import { getSectorsForSatellite, getBandsForSatellite } from '../liveTabUtils';
import type { Product, CollectionType, PaginatedFrames } from '../types';

interface StudioFrameSelectionProps {
  readonly selectionMode: 'filters' | 'collection';
  readonly setSelectionMode: (v: 'filters' | 'collection') => void;
  readonly satellite: string;
  readonly setSatellite: (v: string) => void;
  readonly band: string;
  readonly setBand: (v: string) => void;
  readonly sector: string;
  readonly setSector: (v: string) => void;
  readonly startDate: string;
  readonly setStartDate: (v: string) => void;
  readonly endDate: string;
  readonly setEndDate: (v: string) => void;
  readonly collectionId: string;
  readonly setCollectionId: (v: string) => void;
  readonly products: Product | undefined;
  readonly collections: CollectionType[] | undefined;
  readonly previewFrames: PaginatedFrames | undefined;
}

export function StudioFrameSelection({
  selectionMode,
  setSelectionMode,
  satellite,
  setSatellite,
  band,
  setBand,
  sector,
  setSector,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  collectionId,
  setCollectionId,
  products,
  collections,
  previewFrames,
}: StudioFrameSelectionProps) {
  const isHimawari = satellite ? isHimawariSatellite(satellite) : false;
  const bandInfoMap = isHimawari ? HIMAWARI_BAND_INFO : BAND_INFO;
  const sectorOptions = satellite
    ? getSectorsForSatellite(satellite, products?.sectors)
    : (products?.sectors ?? []);
  const bandOptions = satellite
    ? getBandsForSatellite(satellite, products?.bands)
    : (products?.bands ?? []);

  return (
    <div className="lg:col-span-2 space-y-4">
      <div className="card p-6 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Film className="w-5 h-5 text-primary" /> Frame Selection
        </h3>

        <fieldset aria-label="Frame selection mode" className="flex gap-2 border-none p-0 m-0">
          <button
            onClick={() => setSelectionMode('filters')}
            aria-pressed={selectionMode === 'filters'}
            className={`px-3 py-1.5 text-sm rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${selectionMode === 'filters' ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
          >
            By Filters
          </button>
          <button
            onClick={() => setSelectionMode('collection')}
            aria-pressed={selectionMode === 'collection'}
            className={`px-3 py-1.5 text-sm rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${selectionMode === 'collection' ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'}`}
          >
            From Collection
          </button>
        </fieldset>

        {selectionMode === 'filters' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="anim-satellite"
                className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
              >
                Satellite
              </label>
              <select
                id="anim-satellite"
                value={satellite}
                onChange={(e) => setSatellite(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
              >
                <option value="">All</option>
                {(products?.satellites ?? []).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="anim-band"
                className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
              >
                Band
              </label>
              <select
                id="anim-band"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
              >
                <option value="">All</option>
                {bandOptions.map((b) => {
                  const info = bandInfoMap[b.id];
                  let suffix = '';
                  if (info) {
                    suffix = ` — ${info.name} (${info.wavelength})`;
                  } else if (b.description) {
                    suffix = ` — ${b.description}`;
                  }
                  return (
                    <option key={b.id} value={b.id}>
                      {b.id}
                      {suffix}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label
                htmlFor="anim-sector"
                className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
              >
                Sector
              </label>
              <select
                id="anim-sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
              >
                <option value="">All</option>
                {sectorOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="anim-start-date"
                className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
              >
                Start Date
              </label>
              <input
                id="anim-start-date"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
              />
            </div>
            <div>
              <label
                htmlFor="anim-end-date"
                className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
              >
                End Date
              </label>
              <input
                id="anim-end-date"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
              />
            </div>
          </div>
        ) : (
          <div>
            <label
              htmlFor="anim-collection"
              className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
            >
              Collection
            </label>
            <select
              id="anim-collection"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5"
            >
              <option value="">Select collection...</option>
              {(collections ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.frame_count ?? 0} frames)
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Preview strip */}
        {previewFrames && previewFrames.total > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {previewFrames.total} frames matched (showing first {previewFrames.items.length})
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {previewFrames.items.map((frame) => (
                <div key={frame.id} className="shrink-0 w-24">
                  <div className="aspect-video bg-gray-100 dark:bg-slate-800 rounded overflow-hidden">
                    {(frame.thumbnail_url ?? frame.image_url) ? (
                      <Image
                        src={frame.thumbnail_url ?? frame.image_url}
                        alt={`${frame.satellite} ${frame.band} frame preview captured ${new Date(frame.capture_time).toLocaleString()}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Satellite className="w-4 h-4 text-gray-400 dark:text-slate-600" />
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1 truncate">
                    {new Date(frame.capture_time).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
