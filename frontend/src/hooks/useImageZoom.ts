import { useState, useCallback, useRef, useEffect, type CSSProperties, type TouchEvent, type WheelEvent, type MouseEvent, type RefObject } from 'react';

interface ZoomState {
  scale: number;
  translateX: number;
  translateY: number;
  isInteracting: boolean;
}

interface UseImageZoomOptions {
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
  containerRef?: RefObject<HTMLElement | null>;
  imageRef?: RefObject<HTMLImageElement | null>;
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
  zoomIn: () => void;
  isZoomed: boolean;
}

const INITIAL_STATE: ZoomState = { scale: 1, translateX: 0, translateY: 0, isInteracting: false };
const DEFAULT_ASPECT = 5 / 3;

/** Clamp translate values so the image cannot be panned off-screen.
 *  Uses rendered image dimensions (via imageAspect) instead of raw container size. */
export function clampTranslate(
  tx: number,
  ty: number,
  scale: number,
  containerWidth: number,
  containerHeight: number,
  imageAspect: number = DEFAULT_ASPECT,
): { tx: number; ty: number } {
  if (scale <= 1) return { tx: 0, ty: 0 };
  const renderedW = Math.min(containerWidth, containerHeight * imageAspect);
  const renderedH = Math.min(containerHeight, containerWidth / imageAspect);
  const maxX = Math.max(0, (renderedW * scale - containerWidth) / 2);
  const maxY = Math.max(0, (renderedH * scale - containerHeight) / 2);
  return {
    tx: Math.min(maxX, Math.max(-maxX, tx)),
    ty: Math.min(maxY, Math.max(-maxY, ty)),
  };
}

function getContainerDimensions(containerRef?: RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const rect = containerRef?.current?.getBoundingClientRect();
  if (!rect) return null;
  return { width: rect.width, height: rect.height };
}

export function useImageZoom(options: UseImageZoomOptions = {}): UseImageZoomReturn {
  const { minScale = 1, maxScale = 5, doubleTapScale = 2.5, containerRef, imageRef } = options;

  const [state, setState] = useState<ZoomState>(INITIAL_STATE);
  const stateRef = useRef<ZoomState>(INITIAL_STATE);
  const pinchStartRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const isDragging = useRef(false);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clampScale = useCallback((s: number) => Math.min(maxScale, Math.max(minScale, s)), [minScale, maxScale]);

  const clampXY = useCallback((tx: number, ty: number, scale: number): { tx: number; ty: number } => {
    const dims = getContainerDimensions(containerRef);
    if (!dims) return { tx, ty };
    const img = imageRef?.current;
    const aspect = (img && img.naturalWidth > 0 && img.naturalHeight > 0)
      ? img.naturalWidth / img.naturalHeight
      : DEFAULT_ASPECT;
    return clampTranslate(tx, ty, scale, dims.width, dims.height, aspect);
  }, [containerRef, imageRef]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const zoomIn = useCallback(() => {
    setState({ scale: doubleTapScale, translateX: 0, translateY: 0, isInteracting: false });
  }, [doubleTapScale]);

  const onWheel = useCallback((e: WheelEvent) => {
    if (stateRef.current.scale > 1) {
      e.preventDefault();
    }
    setState((prev) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = clampScale(prev.scale * factor);
      if (newScale <= 1) return INITIAL_STATE;
      const clamped = clampXY(prev.translateX, prev.translateY, newScale);
      return { ...prev, scale: newScale, translateX: clamped.tx, translateY: clamped.ty };
    });
  }, [clampScale, clampXY]);

  const getTouchDist = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = useCallback((e: TouchEvent) => {
    const s = stateRef.current;
    setState((prev) => ({ ...prev, isInteracting: true }));
    if (e.touches.length === 2) {
      pinchStartRef.current = { dist: getTouchDist(e), scale: s.scale };
    } else if (e.touches.length === 1 && s.scale > 1) {
      const touch = e.touches[0];
      panRef.current = { startX: touch.clientX, startY: touch.clientY, tx: s.translateX, ty: s.translateY };
    }
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e);
      const newScale = clampScale(pinchStartRef.current.scale * (dist / pinchStartRef.current.dist));
      setState((prev) => {
        if (newScale <= 1) return INITIAL_STATE;
        const clamped = clampXY(prev.translateX, prev.translateY, newScale);
        return { ...prev, scale: newScale, translateX: clamped.tx, translateY: clamped.ty };
      });
    } else if (e.touches.length === 1 && panRef.current && stateRef.current.scale > 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - panRef.current.startX;
      const dy = touch.clientY - panRef.current.startY;
      const rawTx = panRef.current.tx + dx;
      const rawTy = panRef.current.ty + dy;
      const clamped = clampXY(rawTx, rawTy, stateRef.current.scale);
      setState((prev) => ({ ...prev, translateX: clamped.tx, translateY: clamped.ty }));
    }
  }, [clampScale, clampXY]);

  const onTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    panRef.current = null;
    // Snap back if out of bounds
    setState((prev) => {
      const clamped = clampXY(prev.translateX, prev.translateY, prev.scale);
      return { ...prev, isInteracting: false, translateX: clamped.tx, translateY: clamped.ty };
    });
  }, [clampXY]);

  const onMouseDown = useCallback((e: MouseEvent) => {
    const s = stateRef.current;
    if (s.scale > 1) {
      isDragging.current = true;
      setState((prev) => ({ ...prev, isInteracting: true }));
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: s.translateX, ty: s.translateY };
    }
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current && panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      const rawTx = panRef.current.tx + dx;
      const rawTy = panRef.current.ty + dy;
      const clamped = clampXY(rawTx, rawTy, stateRef.current.scale);
      setState((prev) => ({ ...prev, translateX: clamped.tx, translateY: clamped.ty }));
    }
  }, [clampXY]);

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    panRef.current = null;
    setState((prev) => {
      const clamped = clampXY(prev.translateX, prev.translateY, prev.scale);
      return { ...prev, isInteracting: false, translateX: clamped.tx, translateY: clamped.ty };
    });
  }, [clampXY]);

  const style: CSSProperties = {
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    transformOrigin: 'center center',
    cursor: state.scale > 1 ? 'grab' : 'default',
    touchAction: 'none',
    transition: state.isInteracting ? 'none' : 'transform 0.1s ease-out',
  };

  return {
    style,
    handlers: { onWheel, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseMove, onMouseUp },
    reset,
    zoomIn,
    isZoomed: state.scale > 1,
  };
}
