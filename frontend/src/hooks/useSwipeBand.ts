import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Product } from '../components/GoesData/types';
import { getFriendlyBandLabel, getBandsForSatellite } from '../components/GoesData/liveTabUtils';

export function useSwipeBand(
  products: Product | undefined,
  band: string,
  setBand: (b: string) => void,
  satellite?: string,
) {
  const bandKeys = useMemo(() => {
    const bands = getBandsForSatellite(
      satellite ?? '',
      products?.bands?.map((b) => ({ id: b.id, description: b.description })),
    );
    return bands.map((b) => b.id);
  }, [products, satellite]);

  const [swipeToast, setSwipeToast] = useState<string | null>(null);
  const swipeToastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const wasPinching = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length >= 2) {
      wasPinching.current = true;
    } else if (e.touches.length === 1) {
      wasPinching.current = false;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent, isZoomed?: boolean) => {
      if (!touchStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      touchStart.current = null;
      if (isZoomed || wasPinching.current) return;
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      const currentIdx = bandKeys.indexOf(band);
      if (currentIdx < 0) return;
      const nextIdx = dx < 0 ? currentIdx + 1 : currentIdx - 1;
      if (nextIdx < 0 || nextIdx >= bandKeys.length) return;
      const nextBand = bandKeys[nextIdx];
      setBand(nextBand);
      const label = getFriendlyBandLabel(nextBand, undefined, 'short', satellite);
      clearTimeout(swipeToastTimer.current);
      setSwipeToast(`${nextBand} — ${label}`);
      swipeToastTimer.current = setTimeout(() => setSwipeToast(null), 2000);
    },
    [band, bandKeys, setBand, satellite],
  );

  // Clean up timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => clearTimeout(swipeToastTimer.current);
  }, []);

  return { swipeToast, handleTouchStart, handleTouchEnd };
}
