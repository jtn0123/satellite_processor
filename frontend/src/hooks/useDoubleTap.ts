import { useRef, useCallback } from 'react';

/**
 * Distinguishes single-tap from double-tap.
 * Single tap fires after 300ms delay; double tap fires immediately on second tap.
 */
export function useDoubleTap(
  onSingleTap: () => void,
  onDoubleTap: () => void,
  delay = 300,
) {
  const lastTap = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleTap = useCallback(() => {
    const now = Date.now();
    const elapsed = now - lastTap.current;
    lastTap.current = now;

    if (elapsed < delay && elapsed > 0) {
      // Double tap
      clearTimeout(timer.current);
      onDoubleTap();
    } else {
      // Possible single tap — wait for potential second tap
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        onSingleTap();
      }, delay);
    }
  }, [onSingleTap, onDoubleTap, delay]);

  return handleTap;
}
