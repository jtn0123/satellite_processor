import type { Product, TagType, CollectionType } from '../types';
import type { BrowseFilterState } from './useBrowseFilters';

interface FilterSidebarProps {
  filters: BrowseFilterState;
  products: Product | undefined;
  collections: CollectionType[] | undefined;
  collectionsError: boolean;
  tags: TagType[] | undefined;
  tagsError: boolean;
  showMobileFilters: boolean;
}

export default function FilterSidebar({
  filters,
  products,
  collections,
  collectionsError,
  tags,
  tagsError,
  showMobileFilters,
}: Readonly<FilterSidebarProps>) {
  return (
    <div className={`w-64 shrink-0 space-y-4 ${showMobileFilters ? 'block' : 'hidden'} md:block`}>
      <div className="card p-4 space-y-3 inset-shadow-sm dark:inset-shadow-white/5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-600 dark:text-slate-300">Filters</h3>
          {filters.hasActiveFilters && (
            <button
              onClick={filters.clearAll}
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        <div>
          <label
            htmlFor="browse-satellite"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Satellite
          </label>
          <select
            id="browse-satellite"
            value={filters.filterSat}
            onChange={(e) => filters.setFilterSat(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content"
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
            htmlFor="browse-band"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Band
          </label>
          <select
            id="browse-band"
            value={filters.filterBand}
            onChange={(e) => filters.setFilterBand(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content"
          >
            <option value="">All</option>
            {(products?.bands ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="browse-sector"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Sector
          </label>
          <select
            id="browse-sector"
            value={filters.filterSector}
            onChange={(e) => filters.setFilterSector(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content"
          >
            <option value="">All</option>
            {(products?.sectors ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="browse-collection"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Collection
          </label>
          <select
            id="browse-collection"
            value={filters.filterCollection}
            onChange={(e) => filters.setFilterCollection(e.target.value)}
            className={`w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content${collectionsError ? ' border-red-400' : ''}`}
          >
            <option value="">{collectionsError ? 'Failed to load' : 'All'}</option>
            {(collections ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="browse-tag"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Tag
          </label>
          <select
            id="browse-tag"
            value={filters.filterTag}
            onChange={(e) => filters.setFilterTag(e.target.value)}
            className={`w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content${tagsError ? ' border-red-400' : ''}`}
          >
            <option value="">{tagsError ? 'Failed to load' : 'All'}</option>
            {(tags ?? []).map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="browse-sort"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Sort by
          </label>
          <select
            id="browse-sort"
            value={filters.sortBy}
            onChange={(e) => filters.setSortBy(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content"
          >
            <option value="capture_time">Capture Time</option>
            <option value="file_size">Size</option>
            <option value="satellite">Satellite</option>
            <option value="created_at">Added</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="browse-order"
            className="block text-xs text-gray-400 dark:text-slate-500 mb-1"
          >
            Order
          </label>
          <select
            id="browse-order"
            value={filters.sortOrder}
            onChange={(e) => filters.setSortOrder(e.target.value)}
            className="w-full rounded bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm px-2 py-1.5 field-sizing-content"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
      </div>
    </div>
  );
}
