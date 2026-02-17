import { useRef, useCallback, useEffect } from 'react';

interface UseSwipeTabsOptions<T extends string> {
  tabs: T[];
  activeTab: T;
  onSwipe: (tab: T) => void;
  threshold?: number;
  enabled?: boolean;
}

/**
 * Hook to enable swipe-between-tabs on mobile.
 * Returns a ref to attach to the swipeable container.
 */
export function useSwipeTabs<T extends string>({
  tabs,
  activeTab,
  onSwipe,
  threshold = 50,
  enabled = true,
}: UseSwipeTabsOptions<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, [enabled]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!enabled || !touchStart.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.time;
    touchStart.current = null;

    // Must be horizontal swipe (more horizontal than vertical), fast enough, and long enough
    if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx) || dt > 500) return;

    const currentIdx = tabs.indexOf(activeTab);
    if (currentIdx === -1) return;

    if (dx < 0 && currentIdx < tabs.length - 1) {
      onSwipe(tabs[currentIdx + 1]);
    } else if (dx > 0 && currentIdx > 0) {
      onSwipe(tabs[currentIdx - 1]);
    }
  }, [enabled, tabs, activeTab, onSwipe, threshold]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd]);

  return containerRef;
}
