import { useState, useMemo } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';

function buildFilterParams(
  sortBy: string,
  sortOrder: string,
  sat: string,
  bandVal: string,
  sector: string,
  collection: string,
  tag: string,
): Record<string, string> {
  const p: Record<string, string> = { sort: sortBy, order: sortOrder };
  if (sat) p.satellite = sat;
  if (bandVal) p.band = bandVal;
  if (sector) p.sector = sector;
  if (collection) p.collection_id = collection;
  if (tag) p.tag = tag;
  return p;
}

export interface BrowseFilterState {
  filterSat: string;
  setFilterSat: (v: string) => void;
  filterBand: string;
  setFilterBand: (v: string) => void;
  filterSector: string;
  setFilterSector: (v: string) => void;
  filterCollection: string;
  setFilterCollection: (v: string) => void;
  filterTag: string;
  setFilterTag: (v: string) => void;
  sortBy: string;
  setSortBy: (v: string) => void;
  sortOrder: string;
  setSortOrder: (v: string) => void;
  filterParams: Record<string, string>;
  hasActiveFilters: boolean;
  clearAll: () => void;
}

export function useBrowseFilters(): BrowseFilterState {
  const [filterSat, setFilterSat] = useState('');
  const [filterBand, setFilterBand] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [filterCollection, setFilterCollection] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [sortBy, setSortBy] = useState('capture_time');
  const [sortOrder, setSortOrder] = useState('desc');

  const debouncedSat = useDebounce(filterSat, 300);
  const debouncedBand = useDebounce(filterBand, 300);
  const debouncedSector = useDebounce(filterSector, 300);
  const debouncedCollection = useDebounce(filterCollection, 300);
  const debouncedTag = useDebounce(filterTag, 300);

  const filterParams = useMemo(
    () => buildFilterParams(sortBy, sortOrder, debouncedSat, debouncedBand, debouncedSector, debouncedCollection, debouncedTag),
    [sortBy, sortOrder, debouncedSat, debouncedBand, debouncedSector, debouncedCollection, debouncedTag],
  );

  const hasActiveFilters = !!(filterSat || filterBand || filterSector || filterCollection || filterTag);

  const clearAll = () => {
    setFilterSat('');
    setFilterBand('');
    setFilterSector('');
    setFilterCollection('');
    setFilterTag('');
  };

  return {
    filterSat, setFilterSat,
    filterBand, setFilterBand,
    filterSector, setFilterSector,
    filterCollection, setFilterCollection,
    filterTag, setFilterTag,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    filterParams,
    hasActiveFilters,
    clearAll,
  };
}
