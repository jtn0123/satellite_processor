/**
 * JTN-387: Extract the desktop/mobile controls overlay visibility state
 * from LiveTab. On desktop the overlay is always pinned visible; on
 * mobile it auto-hides after 5s of inactivity. Behavior is identical to
 * the original inline implementation — see the JTN-408 ISSUE-011 notes
 * in LiveTab for historical context.
 */
import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLiveOverlayResult {
  readonly overlayVisible: boolean;
  readonly setOverlayVisible: (v: boolean | ((v: boolean) => boolean)) => void;
  readonly resetOverlayTimer: () => void;
  readonly toggleOverlay: () => void;
}

export function useLiveOverlay(isMobile: boolean): UseLiveOverlayResult {
  const [overlayVisible, setOverlayVisible] = useState(true);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const resetOverlayTimer = useCallback(() => {
    clearTimeout(overlayTimer.current);
    if (!isMobile) {
      setOverlayVisible(true);
      return;
    }
    overlayTimer.current = setTimeout(() => setOverlayVisible(false), 5000);
  }, [isMobile]);

  /* eslint-disable react-hooks/set-state-in-effect -- intentional desktop/mobile sync */
  useEffect(() => {
    if (!isMobile) {
      setOverlayVisible(true);
      return;
    }
    resetOverlayTimer();
    return () => clearTimeout(overlayTimer.current);
  }, [resetOverlayTimer, isMobile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleOverlay = useCallback(() => {
    if (!isMobile) {
      // Desktop: overlay is pinned open, no toggle behavior needed.
      setOverlayVisible(true);
      return;
    }
    setOverlayVisible((v) => {
      const next = !v;
      if (next) resetOverlayTimer();
      return next;
    });
  }, [resetOverlayTimer, isMobile]);

  return { overlayVisible, setOverlayVisible, resetOverlayTimer, toggleOverlay };
}
