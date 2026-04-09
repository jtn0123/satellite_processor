/**
 * JTN-387: Extract query orchestration from LiveTab.
 *
 * Centralizes the four TanStack Query calls LiveTab needs: products,
 * latest frame, previous-frame comparison, and catalog latest metadata.
 * The behavior matches the previous inline definitions exactly — this is
 * a pure refactor so that LiveTab stays under the ~250-LOC target.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../../../api/client';
import type { LatestFrame, CatalogLatest, Product } from '../types';
import { isNotFoundError } from './useLiveHooks';

interface UseLiveQueriesArgs {
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly refreshInterval: number;
  readonly compareMode: boolean;
}

interface UseLiveQueriesResult {
  readonly products: Product | undefined;
  readonly frame: LatestFrame | undefined;
  readonly recentFrames: LatestFrame[] | undefined;
  readonly catalogLatest: CatalogLatest | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => Promise<unknown>;
}

export function useLiveQueries({
  satellite,
  sector,
  band,
  refreshInterval,
  compareMode,
}: UseLiveQueriesArgs): UseLiveQueriesResult {
  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
  });

  const {
    data: frame,
    isLoading,
    isError,
    refetch,
  } = useQuery<LatestFrame>({
    queryKey: ['goes-latest', satellite, sector, band],
    queryFn: () =>
      api.get('/satellite/latest', { params: { satellite, sector, band } }).then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
  });

  const { data: recentFrames } = useQuery<LatestFrame[]>({
    queryKey: ['goes-frames-compare', satellite, sector, band],
    queryFn: () =>
      api
        .get('/satellite/frames', {
          params: { satellite, sector, band, limit: 2, sort: 'capture_time', order: 'desc' },
        })
        .then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite && compareMode,
  });

  const { data: catalogLatest } = useQuery<CatalogLatest>({
    queryKey: ['goes-catalog-latest-live', satellite, sector, band],
    queryFn: () =>
      api
        .get('/satellite/catalog/latest', { params: { satellite, sector, band } })
        .then((r) => r.data),
    refetchInterval: refreshInterval,
    enabled: !!satellite,
    retry: 1,
  });

  return { products, frame, recentFrames, catalogLatest, isLoading, isError, refetch };
}
