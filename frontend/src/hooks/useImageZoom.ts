import { useState, useCallback, useRef, type CSSProperties, type TouchEvent, type WheelEvent, type MouseEvent } from 'react';

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

interface UseImageZoomOptions {
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
}

interface UseImageZoomReturn {
  style: CSSProperties;
  handlers: {
    onWheel: (e: WheelEvent) => void;
    onTouchStart: (e: TouchEvent) => void;
    onTouchMove: (e: TouchEvent) => void;
    onTouchEnd: (e: TouchEvent) => void;
    onMouseDown: (e: MouseEvent) => void;
    onMouseMove: (e: MouseEvent) => void;
    onMouseUp: () => void;
  };
  reset: () => void;
  isZoomed: boolean;
}

const INITIAL_STATE: ZoomState = { scale: 1, translateX: 0, translateY: 0 };

export function useImageZoom(options: UseImageZoomOptions = {}): UseImageZoomReturn {
  const { minScale = 1, maxScale = 5, doubleTapScale = 2.5 } = options;

  const [state, setState] = useState<ZoomState>(INITIAL_STATE);
  const stateRef = useRef<ZoomState>(INITIAL_STATE);
  const lastTouchRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const isDragging = useRef(false);

  // Keep stateRef in sync
  stateRef.current = state;

  const clampScale = useCallback((s: number) => Math.min(maxScale, Math.max(minScale, s)), [minScale, maxScale]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setState((prev) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = clampScale(prev.scale * factor);
      if (newScale <= 1) return INITIAL_STATE;
      return { ...prev, scale: newScale };
    });
  }, [clampScale]);

  const getTouchDist = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = useCallback((e: TouchEvent) => {
    const s = stateRef.current;
    if (e.touches.length === 2) {
      pinchStartRef.current = { dist: getTouchDist(e), scale: s.scale };
    } else if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];
      const last = lastTouchRef.current;

      // Double-tap detection
      if (last && now - last.time < 300 && Math.abs(touch.clientX - last.x) < 30 && Math.abs(touch.clientY - last.y) < 30) {
        setState((prev) => prev.scale > 1 ? INITIAL_STATE : { scale: doubleTapScale, translateX: 0, translateY: 0 });
        lastTouchRef.current = null;
        return;
      }
      lastTouchRef.current = { time: now, x: touch.clientX, y: touch.clientY };

      // Pan start — read current values from ref to avoid stale closure
      if (s.scale > 1) {
        panRef.current = { startX: touch.clientX, startY: touch.clientY, tx: s.translateX, ty: s.translateY };
      }
    }
  }, [doubleTapScale]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e);
      const newScale = clampScale(pinchStartRef.current.scale * (dist / pinchStartRef.current.dist));
      setState((prev) => newScale <= 1 ? INITIAL_STATE : { ...prev, scale: newScale });
    } else if (e.touches.length === 1 && panRef.current && stateRef.current.scale > 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - panRef.current.startX;
      const dy = touch.clientY - panRef.current.startY;
      setState((prev) => ({ ...prev, translateX: panRef.current!.tx + dx, translateY: panRef.current!.ty + dy }));
    }
  }, [clampScale]);

  const onTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    panRef.current = null;
  }, []);

  // Mouse drag for desktop panning
  const onMouseDown = useCallback((e: MouseEvent) => {
    const s = stateRef.current;
    if (s.scale > 1) {
      isDragging.current = true;
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: s.translateX, ty: s.translateY };
    }
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current && panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setState((prev) => ({ ...prev, translateX: panRef.current!.tx + dx, translateY: panRef.current!.ty + dy }));
    }
  }, []);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    panRef.current = null;
  }, []);

  const style: CSSProperties = {
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    transformOrigin: 'center center',
    cursor: state.scale > 1 ? 'grab' : 'default',
    touchAction: state.scale > 1 ? 'none' : 'auto',
    transition: 'transform 0.1s ease-out',
  };

  return {
    style,
    handlers: { onWheel, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseMove, onMouseUp },
    reset,
    isZoomed: state.scale > 1,
  };
}
