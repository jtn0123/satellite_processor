import { useEffect, useCallback, useRef } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useImageZoom } from '../../hooks/useImageZoom';
import type { GoesFrame } from './types';

interface ImageViewerProps {
  frame: GoesFrame;
  frames: GoesFrame[];
  onClose: () => void;
  onNavigate: (frame: GoesFrame) => void;
}

export default function ImageViewer({ frame, frames, onClose, onNavigate }: Readonly<ImageViewerProps>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const { scale, style, handlers, reset, setScale } = useImageZoom({
    minScale: 0.5,
    maxScale: 10,
    doubleTapScale: 2.5,
    containerRef,
    imageRef,
  });

  const currentIndex = frames.findIndex((f) => f.id === frame.id);

  const goNext = useCallback(() => {
    if (currentIndex < frames.length - 1) {
      onNavigate(frames[currentIndex + 1]);
      reset();
    }
  }, [currentIndex, frames, onNavigate, reset]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(frames[currentIndex - 1]);
      reset();
    }
  }, [currentIndex, frames, onNavigate, reset]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev]);

  return (
    <dialog
      open
      aria-label="Image viewer"
      className="fixed inset-0 z-50 bg-black/90 flex flex-col m-0 w-full h-full max-w-none max-h-none border-none p-0"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-semibold">{frame.satellite}</span>
          <span>Band {frame.band}</span>
          <span>{frame.sector}</span>
          <span>{new Date(frame.capture_time).toLocaleString()}</span>
          <span className="text-white/50">
            {currentIndex + 1} / {frames.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setScale(scale + 0.5)} className="p-2 hover:bg-white/10 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden" title="Zoom in" aria-label="Zoom in">
            <ZoomIn className="w-5 h-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setScale(scale - 0.5)} className="p-2 hover:bg-white/10 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden" title="Zoom out" aria-label="Zoom out">
            <ZoomOut className="w-5 h-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={reset} className="p-2 hover:bg-white/10 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden" title="Reset zoom" aria-label="Reset zoom">
            <RotateCcw className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="text-sm text-white/50 w-16 text-center" aria-live="polite" aria-label={`Zoom level ${Math.round(scale * 100)}%`}>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden" title="Close" aria-label="Close image viewer">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden flex items-center justify-center">
        {currentIndex > 0 && (
          <button type="button" onClick={goPrev} aria-label="Previous image" className="absolute left-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden">
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          aria-label="Pan and zoom area — use mouse wheel to zoom, drag to pan"
          onWheel={handlers.onWheel}
          onTouchStart={handlers.onTouchStart}
          onTouchMove={handlers.onTouchMove}
          onTouchEnd={handlers.onTouchEnd}
          onMouseDown={handlers.onMouseDown}
          onMouseMove={handlers.onMouseMove}
          onMouseUp={handlers.onMouseUp}
          className="flex items-center justify-center bg-transparent border-none p-0 m-0 outline-none"
        >
          <img
            ref={imageRef}
            src={`/api/satellite/frames/${frame.id}/image`}
            alt={`${frame.satellite} ${frame.band} — Use zoom buttons to zoom`}
            className="max-h-full max-w-full select-none"
            style={style}
            draggable={false}
          />
        </button>

        {currentIndex < frames.length - 1 && (
          <button type="button" onClick={goNext} aria-label="Next image" className="absolute right-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden">
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        )}
      </div>
    </dialog>
  );
}
