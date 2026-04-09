/**
 * JTN-387: Extract zoom state management out of LiveTab/LiveImageArea.
 *
 * Combines useImageZoom with its companion concerns:
 *   - the "pinch to exit" hint that fades in on first zoom
 *   - the `isFullscreen` state and the document fullscreenchange sync
 *   - a reset whenever the satellite/sector/band combination changes
 *
 * Behavior is identical to the inline implementation — this is a pure
 * refactor so leaf components stay small.
 */
import { useCallback, useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { useImageZoom } from '../../../hooks/useImageZoom';
import { useZoomHint, useFullscreenSync } from './useLiveHooks';
import { enterFullscreenSafe, exitFullscreenSafe } from './liveHelpers';

interface UseZoomStateArgs {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly imageRef: RefObject<HTMLImageElement | null>;
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
}

type ZoomReturn = ReturnType<typeof useImageZoom>;

interface UseZoomStateResult {
  readonly zoom: ZoomReturn;
  readonly showZoomHint: boolean;
  readonly isFullscreen: boolean;
  readonly setIsFullscreen: Dispatch<SetStateAction<boolean>>;
  readonly toggleFullscreen: () => Promise<void>;
}

export function useZoomState({
  containerRef,
  imageRef,
  satellite,
  sector,
  band,
}: UseZoomStateArgs): UseZoomStateResult {
  const zoom = useImageZoom({ containerRef, imageRef, eliminateLetterbox: true });
  const showZoomHint = useZoomHint(zoom.isZoomed);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useFullscreenSync(setIsFullscreen, zoom);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    const isCurrentlyFullscreen = !!document.fullscreenElement;
    await (isCurrentlyFullscreen
      ? exitFullscreenSafe()
      : enterFullscreenSafe(containerRef.current));
    setIsFullscreen(!isCurrentlyFullscreen);
  }, [containerRef]);

  // Reset zoom whenever the image identity (sat/sector/band) changes
  useEffect(() => {
    zoom.reset();
  }, [satellite, sector, band, zoom.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  return { zoom, showZoomHint, isFullscreen, setIsFullscreen, toggleFullscreen };
}
