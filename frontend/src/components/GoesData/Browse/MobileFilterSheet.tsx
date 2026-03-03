import BottomSheet from '../BottomSheet';
import type { Product, TagType, CollectionType } from '../types';
import type { BrowseFilterState } from './useBrowseFilters';

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  filters: BrowseFilterState;
  products: Product | undefined;
  collections: CollectionType[] | undefined;
  collectionsError: boolean;
  tags: TagType[] | undefined;
  tagsError: boolean;
}

export default function MobileFilterSheet({
  open,
  onClose,
  filters,
  products,
  collections,
  collectionsError,
  tags,
  tagsError,
}: Readonly<MobileFilterSheetProps>) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Filters">
      <div className="space-y-4">
        <div>
          <label htmlFor="bs-satellite" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Satellite</label>
          <select id="bs-satellite" value={filters.filterSat} onChange={(e) => filters.setFilterSat(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
            <option value="">All</option>
            {(products?.satellites ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bs-band" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Band</label>
          <select id="bs-band" value={filters.filterBand} onChange={(e) => filters.setFilterBand(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
            <option value="">All</option>
            {(products?.bands ?? []).map((b) => <option key={b.id} value={b.id}>{b.id}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bs-sector" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sector</label>
          <select id="bs-sector" value={filters.filterSector} onChange={(e) => filters.setFilterSector(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
            <option value="">All</option>
            {(products?.sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bs-collection" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Collection</label>
          <select id="bs-collection" value={filters.filterCollection} onChange={(e) => filters.setFilterCollection(e.target.value)}
            className={`w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]${collectionsError ? ' border-red-400' : ''}`}>
            <option value="">{collectionsError ? 'Failed to load' : 'All'}</option>
            {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bs-tag" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Tag</label>
          <select id="bs-tag" value={filters.filterTag} onChange={(e) => filters.setFilterTag(e.target.value)}
            className={`w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]${tagsError ? ' border-red-400' : ''}`}>
            <option value="">{tagsError ? 'Failed to load' : 'All'}</option>
            {(tags ?? []).map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="bs-sort" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Sort by</label>
          <select id="bs-sort" value={filters.sortBy} onChange={(e) => filters.setSortBy(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
            <option value="capture_time">Capture Time</option>
            <option value="file_size">Size</option>
            <option value="satellite">Satellite</option>
            <option value="created_at">Added</option>
          </select>
        </div>
        <div>
          <label htmlFor="bs-order" className="block text-xs text-gray-400 dark:text-slate-500 mb-1">Order</label>
          <select id="bs-order" value={filters.sortOrder} onChange={(e) => filters.setSortOrder(e.target.value)}
            className="w-full rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-3 py-2.5 min-h-[44px]">
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 btn-primary-mix text-gray-900 dark:text-white rounded-xl font-medium text-sm min-h-[44px]"
        >
          Apply Filters
        </button>
      </div>
    </BottomSheet>
  );
}
