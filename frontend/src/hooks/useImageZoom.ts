import { useState, useCallback, useMemo, useRef, useEffect, type CSSProperties, type TouchEvent, type WheelEvent, type MouseEvent, type RefObject } from 'react';

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
  /** When true, zoomed-in views use a minimum effective scale that fills the
   *  container (no letterbox bars), while keeping all image content pannable. */
  eliminateLetterbox?: boolean;
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
  scale: number;
  reset: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setScale: (s: number) => void;
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

/** Minimum scale at which an object-contain image fills the container (no letterbox). */
export function getCoverScale(
  containerWidth: number,
  containerHeight: number,
  imageAspect: number = DEFAULT_ASPECT,
): number {
  const renderedW = Math.min(containerWidth, containerHeight * imageAspect);
  const renderedH = Math.min(containerHeight, containerWidth / imageAspect);
  if (renderedW === 0 || renderedH === 0) return 1;
  return Math.max(containerWidth / renderedW, containerHeight / renderedH);
}

export function useImageZoom(options: UseImageZoomOptions = {}): UseImageZoomReturn {
  const { minScale = 1, maxScale = 5, doubleTapScale = 2.5, containerRef, imageRef, eliminateLetterbox = false } = options;

  const [state, setState] = useState<ZoomState>(INITIAL_STATE);
  const stateRef = useRef<ZoomState>(INITIAL_STATE);
  const pinchStartRef = useRef<{ dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const isDragging = useRef(false);

  // Cache container dimensions and image aspect in state so render doesn't access refs.
  // Also updated by event handlers (onWheel, onTouchStart etc.) for immediate accuracy.
  const [layoutInfo, setLayoutInfo] = useState({ cw: 0, ch: 0, aspect: DEFAULT_ASPECT });

  const syncLayout = useCallback(() => {
    const rect = containerRef?.current?.getBoundingClientRect();
    const img = imageRef?.current;
    const aspect = (img && img.naturalWidth > 0 && img.naturalHeight > 0)
      ? img.naturalWidth / img.naturalHeight
      : DEFAULT_ASPECT;
    setLayoutInfo({ cw: rect?.width ?? 0, ch: rect?.height ?? 0, aspect });
  }, [containerRef, imageRef]);

  useEffect(() => {
    syncLayout(); // eslint-disable-line react-hooks/set-state-in-effect -- initial dimension read from refs
    const el = containerRef?.current;
    if (!el) return;
    const ro = new ResizeObserver(syncLayout);
    ro.observe(el);
    const imgEl = imageRef?.current;
    if (imgEl?.addEventListener) imgEl.addEventListener('load', syncLayout);
    return () => {
      ro.disconnect();
      if (imgEl?.removeEventListener) imgEl.removeEventListener('load', syncLayout);
    };
  }, [containerRef, imageRef, syncLayout]);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clampScale = useCallback((s: number) => Math.min(maxScale, Math.max(minScale, s)), [minScale, maxScale]);

  // Event-time helpers that read refs (only called from event handlers, not render)
  const getAspect = useCallback((): number => {
    const img = imageRef?.current;
    return (img && img.naturalWidth > 0 && img.naturalHeight > 0)
      ? img.naturalWidth / img.naturalHeight
      : DEFAULT_ASPECT;
  }, [imageRef]);

  const clampXY = useCallback((tx: number, ty: number, scale: number): { tx: number; ty: number } => {
    const dims = getContainerDimensions(containerRef);
    if (!dims) return { tx, ty };
    const aspect = getAspect();
    const effective = eliminateLetterbox && scale > 1
      ? Math.max(scale, getCoverScale(dims.width, dims.height, aspect))
      : scale;
    return clampTranslate(tx, ty, effective, dims.width, dims.height, aspect);
  }, [containerRef, getAspect, eliminateLetterbox]);

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const zoomIn = useCallback(() => {
    setState({ scale: doubleTapScale, translateX: 0, translateY: 0, isInteracting: false });
  }, [doubleTapScale]);

  const zoomOut = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const setScaleTo = useCallback((s: number) => {
    if (s < minScale) {
      setState(INITIAL_STATE);
    } else {
      const clamped = clampScale(s);
      setState((prev) => {
        const clampedXY = clampXY(prev.translateX, prev.translateY, clamped);
        return { ...prev, scale: clamped, translateX: clampedXY.tx, translateY: clampedXY.ty };
      });
    }
  }, [clampScale, clampXY, minScale]);

  const onWheel = useCallback((e: WheelEvent) => {
    if (stateRef.current.scale > 1) {
      e.preventDefault();
    }
    syncLayout();
    const rect = containerRef?.current?.getBoundingClientRect();
    const cx = e.clientX ?? 0;
    const cy = e.clientY ?? 0;
    const cursorX = rect ? cx - rect.left - rect.width / 2 : 0;
    const cursorY = rect ? cy - rect.top - rect.height / 2 : 0;

    setState((prev) => {
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rawScale = prev.scale * factor;
      if (rawScale < minScale) return INITIAL_STATE;
      const newScale = clampScale(rawScale);

      // Zoom toward cursor: keep the point under cursor fixed in image space
      const imageX = (cursorX - prev.translateX) / prev.scale;
      const imageY = (cursorY - prev.translateY) / prev.scale;
      const newTx = cursorX - imageX * newScale;
      const newTy = cursorY - imageY * newScale;

      const clamped = clampXY(newTx, newTy, newScale);
      return { ...prev, scale: newScale, translateX: clamped.tx, translateY: clamped.ty };
    });
  }, [clampScale, clampXY, containerRef, minScale, syncLayout]);

  const getTouchDist = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const onTouchStart = useCallback((e: TouchEvent) => {
    syncLayout();
    const s = stateRef.current;
    setState((prev) => ({ ...prev, isInteracting: true }));
    if (e.touches.length === 2) {
      const rect = containerRef?.current?.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      const midX = rect ? (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2 : 0;
      const midY = rect ? (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2 : 0;
      pinchStartRef.current = { dist: getTouchDist(e), scale: s.scale, midX, midY, tx: s.translateX, ty: s.translateY };
    } else if (e.touches.length === 1 && s.scale > 1) {
      const touch = e.touches[0];
      panRef.current = { startX: touch.clientX, startY: touch.clientY, tx: s.translateX, ty: s.translateY };
    }
  }, [containerRef, syncLayout]);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e);
      const startData = pinchStartRef.current;
      const newScale = clampScale(startData.scale * (dist / startData.dist));
      setState(() => {
        if (newScale <= minScale) {
          const clamped = clampXY(0, 0, minScale);
          return { scale: minScale, translateX: clamped.tx, translateY: clamped.ty, isInteracting: true };
        }
        // Zoom toward pinch midpoint: keep the point under midpoint fixed
        const imageX = (startData.midX - startData.tx) / startData.scale;
        const imageY = (startData.midY - startData.ty) / startData.scale;
        const newTx = startData.midX - imageX * newScale;
        const newTy = startData.midY - imageY * newScale;
        const clamped = clampXY(newTx, newTy, newScale);
        return { scale: newScale, translateX: clamped.tx, translateY: clamped.ty, isInteracting: true };
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
  }, [clampScale, clampXY, minScale]);

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

  // Compute style from state only (no ref access during render)
  const style: CSSProperties = useMemo(() => {
    const { cw, ch, aspect } = layoutInfo;
    let effectiveScale = state.scale;
    if (eliminateLetterbox && state.scale > 1 && cw > 0 && ch > 0) {
      effectiveScale = Math.max(state.scale, getCoverScale(cw, ch, aspect));
    }
    let tx = 0, ty = 0;
    if (state.scale > 1 && cw > 0 && ch > 0) {
      const clamped = clampTranslate(state.translateX, state.translateY, effectiveScale, cw, ch, aspect);
      tx = clamped.tx;
      ty = clamped.ty;
    }
    return {
      transform: `translate(${tx}px, ${ty}px) scale(${effectiveScale})`,
      transformOrigin: 'center center',
      cursor: state.scale > 1 ? 'grab' : 'default',
      touchAction: 'none',
      transition: state.isInteracting ? 'none' : 'transform 0.1s ease-out',
    };
  }, [state, layoutInfo, eliminateLetterbox]);

  return {
    scale: state.scale,
    style,
    handlers: { onWheel, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseMove, onMouseUp },
    reset,
    zoomIn,
    zoomOut,
    setScale: setScaleTo,
    isZoomed: state.scale > 1,
  };
}
