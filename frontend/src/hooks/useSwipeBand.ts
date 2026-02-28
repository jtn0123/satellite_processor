import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import type { Product } from '../components/GoesData/types';
import { FRIENDLY_BAND_NAMES, getFriendlyBandName } from '../components/GoesData/liveTabUtils';

export function useSwipeBand(products: Product | undefined, band: string, setBand: (b: string) => void) {
  const bandKeys = useMemo(() => {
    if (products?.bands?.length) return products.bands.map((b) => b.id);
    return Object.keys(FRIENDLY_BAND_NAMES);
  }, [products]);

  const [swipeToast, setSwipeToast] = useState<string | null>(null);
  const swipeToastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent, isZoomed?: boolean) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (isZoomed) return;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    const currentIdx = bandKeys.indexOf(band);
    if (currentIdx < 0) return;
    const nextIdx = dx < 0 ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx < 0 || nextIdx >= bandKeys.length) return;
    const nextBand = bandKeys[nextIdx];
    setBand(nextBand);
    const label = getFriendlyBandName(nextBand);
    clearTimeout(swipeToastTimer.current);
    setSwipeToast(`${nextBand} — ${label}`);
    swipeToastTimer.current = setTimeout(() => setSwipeToast(null), 2000);
  }, [band, bandKeys, setBand]);

  // Clean up timer on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => clearTimeout(swipeToastTimer.current);
  }, []);

  return { swipeToast, handleTouchStart, handleTouchEnd };
}
