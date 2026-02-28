import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { showToast } from '../utils/toast';
import type { CatalogLatest, LatestFrame } from '../components/GoesData/types';

function shouldAutoFetch(
  autoFetch: boolean,
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
  lastAutoFetchTime: string | null,
  lastAutoFetchMs: number,
  hasActiveJob: boolean,
): boolean {
  if (!autoFetch || !catalogLatest || !frame || hasActiveJob) return false;
  const catalogTime = new Date(catalogLatest.scan_time).getTime();
  const localTime = new Date(frame.capture_time).getTime();
  return catalogTime > localTime && lastAutoFetchTime !== catalogLatest.scan_time && Date.now() - lastAutoFetchMs > 30000;
}

export function useLiveFetchJob({
  satellite, sector, band, autoFetch, catalogLatest, frame,
  lastAutoFetchTimeRef, lastAutoFetchMsRef, refetch,
}: {
  satellite: string; sector: string; band: string; autoFetch: boolean;
  catalogLatest: CatalogLatest | null; frame: LatestFrame | null;
  lastAutoFetchTimeRef: React.MutableRefObject<string | null>;
  lastAutoFetchMsRef: React.MutableRefObject<number>;
  refetch: () => Promise<unknown>;
}) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const { data: activeJob } = useQuery<{ id: string; status: string; progress: number; status_message: string }>({
    queryKey: ['live-job', activeJobId],
    queryFn: () => api.get(`/jobs/${activeJobId}`).then((r) => r.data),
    enabled: !!activeJobId,
    refetchInterval: activeJobId ? 2000 : false,
  });

  useEffect(() => {
    if (activeJob && (activeJob.status === 'completed' || activeJob.status === 'failed')) {
      const timer = setTimeout(() => {
        setActiveJobId(null);
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeJob, refetch]);

  const fetchNow = useCallback(async () => {
    const startDate = catalogLatest?.scan_time ?? new Date().toISOString();
    try {
      const res = await api.post('/goes/fetch', {
        satellite: satellite.toUpperCase(), sector, band,
        start_time: startDate,
        end_time: startDate,
      });
      setActiveJobId(res.data.job_id);
      showToast('success', 'Fetching latest frame…');
    } catch {
      showToast('error', 'Failed to start fetch');
    }
  }, [satellite, sector, band, catalogLatest]);

  useEffect(() => {
    if (band === 'GEOCOLOR') return;
    if (!shouldAutoFetch(autoFetch, catalogLatest, frame, lastAutoFetchTimeRef.current, lastAutoFetchMsRef.current, !!activeJobId)) return;
    lastAutoFetchTimeRef.current = catalogLatest!.scan_time;
    lastAutoFetchMsRef.current = Date.now();
    const controller = new AbortController();
    const doAutoFetch = async () => {
      try {
        const res = await api.post('/goes/fetch', {
          satellite: (satellite || catalogLatest!.satellite).toUpperCase(),
          sector: sector || catalogLatest!.sector,
          band: band || catalogLatest!.band,
          start_time: catalogLatest!.scan_time,
          end_time: catalogLatest!.scan_time,
        }, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setActiveJobId(res.data.job_id);
          showToast('success', 'Auto-fetching new frame from AWS');
        }
      } catch { /* auto-fetch failure is non-critical */ }
    };
    doAutoFetch();
    return () => controller.abort();
  }, [autoFetch, catalogLatest, frame, satellite, sector, band, lastAutoFetchTimeRef, lastAutoFetchMsRef, activeJobId]);

  return { activeJobId, activeJob: activeJob ?? null, fetchNow };
}
