import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const STORAGE_KEY = 'liveSwipeHintSeen';

interface SwipeHintProps {
  availableBands?: number;
  isZoomed?: boolean;
}

/**
 * Shows left/right chevron arrows on first visit to hint at swipe-to-change-band.
 * Fades out after 3.5 seconds and sets localStorage so it won't show again.
 * Hidden when only 1 band is available or when zoomed in.
 */
export default function SwipeHint({ availableBands = 2, isZoomed = false }: Readonly<SwipeHintProps>) {
  // Check localStorage synchronously during init to avoid effect setState
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      setVisible(false);
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch { /* ignore */ }
    }, 3500);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible || availableBands <= 1 || isZoomed) return null;

  return (
    <>
      <div
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-700 opacity-60"
        data-testid="swipe-hint-left"
      >
        <ChevronLeft className="w-8 h-8 text-white drop-shadow-lg animate-pulse" />
      </div>
      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none transition-opacity duration-700 opacity-60"
        data-testid="swipe-hint-right"
      >
        <ChevronRight className="w-8 h-8 text-white drop-shadow-lg animate-pulse" />
      </div>
    </>
  );
}
