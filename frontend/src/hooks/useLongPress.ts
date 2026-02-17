import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  onLongPress: (e: React.TouchEvent | React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  delay?: number;
}

/**
 * Hook for long-press detection on mobile (touch-friendly multi-select).
 */
export function useLongPress({ onLongPress, onClick, delay = 500 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const didMove = useRef(false);

  const start = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    isLongPress.current = false;
    didMove.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress(e);
      // Vibrate on supported devices
      if (navigator.vibrate) navigator.vibrate(30);
    }, delay);
  }, [onLongPress, delay]);

  const move = useCallback(() => {
    if (timerRef.current) {
      didMove.current = true;
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const end = useCallback((e: React.MouseEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current && !didMove.current && onClick) {
      onClick(e);
    }
  }, [onClick]);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onClick: (e: React.MouseEvent) => {
      // Prevent click after long press
      if (isLongPress.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
