import { useRef, useCallback, useEffect, useState } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  enabled?: boolean;
}

/**
 * Hook for pull-to-refresh on mobile.
 * Returns a ref for the scrollable container and refresh state.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  enabled = true,
}: UsePullToRefreshOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || isRefreshing) return;
    const el = containerRef.current;
    // Only activate when scrolled to top
    if (el && el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
    }
  }, [enabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) {
      setPullDistance(Math.min(dy * 0.5, threshold * 1.5));
    }
  }, [threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (touchStartY.current === null) return;
    touchStartY.current = null;

    if (pullDistance >= threshold) {
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pullDistance, threshold, onRefresh]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, isRefreshing, pullDistance };
}
