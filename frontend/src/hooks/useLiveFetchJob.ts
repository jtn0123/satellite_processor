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
    const isMeso = sector === 'Mesoscale1' || sector === 'Mesoscale2';
    let startDate: string;
    let endDate: string;

    if (catalogLatest?.scan_time) {
      // Use catalog scan time as the target
      startDate = catalogLatest.scan_time;
      endDate = catalogLatest.scan_time;
    } else if (isMeso) {
      // Meso without catalog: fetch last 10 minutes (1-min cadence)
      const now = new Date();
      const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
      startDate = tenMinAgo.toISOString();
      endDate = now.toISOString();
    } else {
      const now = new Date().toISOString();
      startDate = now;
      endDate = now;
    }

    try {
      const res = await api.post('/goes/fetch', {
        satellite: satellite.toUpperCase(), sector, band,
        start_time: startDate,
        end_time: endDate,
      });
      setActiveJobId(res.data.job_id);
      showToast('success', isMeso ? 'Fetching mesoscale data…' : 'Fetching latest frame…');
    } catch {
      showToast('error', 'Failed to start fetch');
    }
  }, [satellite, sector, band, catalogLatest]);

  useEffect(() => {
    if (band === 'GEOCOLOR') return;
    if (!shouldAutoFetch(autoFetch, catalogLatest, frame, lastAutoFetchTimeRef.current, lastAutoFetchMsRef.current, !!activeJobId)) return;
    lastAutoFetchTimeRef.current = catalogLatest!.scan_time;
    lastAutoFetchMsRef.current = Date.now();
    let cancelled = false;
    const doAutoFetch = async () => {
      try {
        const res = await api.post('/goes/fetch', {
          satellite: (satellite || catalogLatest!.satellite).toUpperCase(),
          sector: sector || catalogLatest!.sector,
          band: band || catalogLatest!.band,
          start_time: catalogLatest!.scan_time,
          end_time: catalogLatest!.scan_time,
        });
        if (!cancelled) {
          setActiveJobId(res.data.job_id);
          showToast('success', 'Auto-fetching new frame from AWS');
        }
      } catch { /* auto-fetch failure is non-critical */ }
    };
    doAutoFetch();
    return () => { cancelled = true; };
  }, [autoFetch, catalogLatest, frame, satellite, sector, band, lastAutoFetchTimeRef, lastAutoFetchMsRef, activeJobId]);

  // Track whether the last fetch job completed but no frame appeared
  const [lastFetchFailed, setLastFetchFailed] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- intentional: derived from async job status */
  useEffect(() => {
    if (activeJob?.status === 'completed' && !frame) {
      setLastFetchFailed(true);
    } else if (activeJob?.status === 'failed') {
      setLastFetchFailed(true);
    } else if (frame) {
      setLastFetchFailed(false);
    }
  }, [activeJob?.status, frame]);

  useEffect(() => {
    setLastFetchFailed(false);
  }, [satellite, sector, band]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return { activeJobId, activeJob: activeJob ?? null, fetchNow, lastFetchFailed };
}
