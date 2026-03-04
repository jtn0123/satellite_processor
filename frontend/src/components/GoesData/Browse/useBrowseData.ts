import { useMemo, useCallback } from 'react';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../api/client';
import { showToast } from '../../../utils/toast';
import { extractArray } from '../../../utils/safeData';
import type { Product, TagType, CollectionType, PaginatedFrames } from '../types';

const PAGE_LIMIT = 50;

export function useBrowseData(filterParams: Record<string, string>) {
  const queryClient = useQueryClient();

  const { data: products } = useQuery<Product>({
    queryKey: ['goes-products'],
    queryFn: () => api.get('/satellite/products').then((r) => r.data),
  });

  const { data: collections, isError: collectionsError } = useQuery<CollectionType[]>({
    queryKey: ['goes-collections'],
    queryFn: () => api.get('/satellite/collections').then((r) => extractArray(r.data)),
    retry: 2,
  });

  const { data: tags, isError: tagsError } = useQuery<TagType[]>({
    queryKey: ['goes-tags'],
    queryFn: () => api.get('/satellite/tags').then((r) => extractArray(r.data)),
    retry: 2,
  });

  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<PaginatedFrames>({
    queryKey: ['goes-frames', filterParams],
    queryFn: ({ pageParam }) =>
      api.get('/satellite/frames', { params: { ...filterParams, page: pageParam, limit: PAGE_LIMIT } }).then((r) => r.data),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const totalPages = Math.ceil((lastPage.total ?? 0) / (lastPage.limit || PAGE_LIMIT));
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });

  const frames = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  );
  const totalFrames = infiniteData?.pages[0]?.total ?? 0;

  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.delete('/satellite/frames', { data: { ids } }),
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['goes-frames'] });
      showToast('success', `Deleted ${ids.length} frame(s)`);
    },
    onError: () => showToast('error', 'Failed to delete frames'),
  });

  const processMutation = useMutation({
    mutationFn: (frameIds: string[]) =>
      api.post('/satellite/frames/process', { frame_ids: frameIds, params: {} }).then((r) => r.data),
    onSuccess: (data) => showToast('success', `Processing job created: ${data.job_id}`),
    onError: () => showToast('error', 'Failed to create processing job'),
  });

  return {
    products, collections, collectionsError, tags, tagsError,
    infiniteData, isLoading, frames, totalFrames,
    fetchNextPage, hasNextPage, isFetchingNextPage,
    handleRefresh, deleteMutation, processMutation,
  };
}
