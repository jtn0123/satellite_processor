import { useState, useEffect, useRef, useMemo, type Dispatch, type SetStateAction } from 'react';
import axios from 'axios';
import { useHotkeys } from '../../../hooks/useHotkeys';
import { extractArray } from '../../../utils/safeData';
import { getPrevBandIndex, getNextBandIndex } from '../liveTabUtils';

export function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/** Shows a "pinch to exit" hint for 2s when first zooming in */
export function useZoomHint(isZoomed: boolean): boolean {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wasZoomed = useRef(false);
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync hint visibility with zoom state */
  useEffect(() => {
    if (isZoomed && !wasZoomed.current) {
      setVisible(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), 2000);
    }
    if (!isZoomed) {
      setVisible(false);
      clearTimeout(timer.current);
    }
    wasZoomed.current = isZoomed;
    return () => clearTimeout(timer.current);
  }, [isZoomed]);
  /* eslint-enable react-hooks/set-state-in-effect */
  return visible;
}

export function useFullscreenSync(
  setIsFullscreen: Dispatch<SetStateAction<boolean>>,
  zoom: { reset: () => void },
) {
  useEffect(() => {
    const handler = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (!fs) zoom.reset();
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [setIsFullscreen, zoom]);
}

interface LiveShortcutsConfig {
  bands?: Array<{ id: string }>;
  band: string;
  isZoomed: boolean;
  isFullscreen: boolean;
  monitoring: boolean;
  setBand: (b: string) => void;
  toggleFullscreen: () => void;
  setCompareMode: Dispatch<SetStateAction<boolean>>;
  toggleMonitor: () => void;
  setLiveAnnouncement: (msg: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

export function useLiveShortcuts(config: Readonly<LiveShortcutsConfig>) {
  const { bands, band, isZoomed, isFullscreen, monitoring, setBand, toggleFullscreen, setCompareMode, toggleMonitor, setLiveAnnouncement, zoomIn, zoomOut, zoomReset } = config;

  const shortcuts = useMemo(() => {
    const bandList = extractArray<{ id: string }>(bands);
    const currentIdx = bandList.findIndex((b) => b.id === band);

    const handleZoomIn = () => { zoomIn(); setLiveAnnouncement('Zoomed in'); };

    return {
      ArrowLeft: () => {
        if (isZoomed || bandList.length === 0) return;
        const prevIdx = getPrevBandIndex(currentIdx, bandList.length);
        setBand(bandList[prevIdx].id);
        setLiveAnnouncement(`Band: ${bandList[prevIdx].id}`);
      },
      ArrowRight: () => {
        if (isZoomed || bandList.length === 0) return;
        const nextIdx = getNextBandIndex(currentIdx, bandList.length);
        setBand(bandList[nextIdx].id);
        setLiveAnnouncement(`Band: ${bandList[nextIdx].id}`);
      },
      f: () => {
        toggleFullscreen();
        setLiveAnnouncement(isFullscreen ? 'Exited fullscreen' : 'Entered fullscreen');
      },
      c: () => {
        setCompareMode((v) => {
          const next = !v;
          setLiveAnnouncement(next ? 'Compare mode on' : 'Compare mode off');
          return next;
        });
      },
      m: () => {
        toggleMonitor();
        setLiveAnnouncement(monitoring ? 'Monitor mode off' : 'Monitor mode on');
      },
      '+': handleZoomIn,
      '=': handleZoomIn,
      '-': () => {
        if (isZoomed) {
          zoomOut();
          setLiveAnnouncement('Zoomed out');
        }
      },
      '0': () => {
        if (isZoomed) {
          zoomReset();
          setLiveAnnouncement('Zoom reset');
        }
      },
    };
  }, [bands, band, isZoomed, isFullscreen, monitoring, setBand, toggleFullscreen, setCompareMode, toggleMonitor, setLiveAnnouncement, zoomIn, zoomOut, zoomReset]);

  useHotkeys(shortcuts);
}
