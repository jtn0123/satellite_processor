import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import type { GoesFrame } from './types';

interface ImageViewerProps {
  frame: GoesFrame;
  frames: GoesFrame[];
  onClose: () => void;
  onNavigate: (frame: GoesFrame) => void;
}

function getCursorStyle(scale: number, dragging: boolean): string {
  if (scale <= 1) return 'default';
  return dragging ? 'grabbing' : 'grab';
}

export default function ImageViewer({ frame, frames, onClose, onNavigate }: Readonly<ImageViewerProps>) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  const currentIndex = frames.findIndex((f) => f.id === frame.id);

  const goNext = useCallback(() => {
    if (currentIndex < frames.length - 1) {
      onNavigate(frames[currentIndex + 1]);
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [currentIndex, frames, onNavigate]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigate(frames[currentIndex - 1]);
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [currentIndex, frames, onNavigate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onClose, goNext, goPrev]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.5, Math.min(10, s + (e.deltaY > 0 ? -0.2 : 0.2))));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (scale <= 1) return;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
    },
    [scale, translate],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      setTranslate({
        x: translateStart.current.x + (e.clientX - dragStart.current.x),
        y: translateStart.current.y + (e.clientY - dragStart.current.y),
      });
    },
    [dragging],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const resetZoom = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  return (
    <dialog
      open
      aria-label="Image viewer"
      className="fixed inset-0 z-50 bg-black/90 flex flex-col m-0 w-full h-full max-w-none max-h-none border-none p-0"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
          <button type="button" onClick={() => setScale((s) => Math.min(10, s + 0.5))} className="p-2 hover:bg-white/10 rounded-lg" title="Zoom in">
            <ZoomIn className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setScale((s) => Math.max(0.5, s - 0.5))} className="p-2 hover:bg-white/10 rounded-lg" title="Zoom out">
            <ZoomOut className="w-5 h-5" />
          </button>
          <button type="button" onClick={resetZoom} className="p-2 hover:bg-white/10 rounded-lg" title="Reset zoom">
            <RotateCcw className="w-5 h-5" />
          </button>
          <span className="text-sm text-white/50 w-16 text-center">{Math.round(scale * 100)}%</span>
          <button type="button" onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {currentIndex > 0 && (
          <button type="button" onClick={goPrev} className="absolute left-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        <button
          type="button"
          role="application"
          aria-label="Pan and zoom area"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          className="flex items-center justify-center bg-transparent border-none p-0 m-0 outline-none"
        >
          <img
            src={`/api/goes/frames/${frame.id}/image`}
            alt={`${frame.satellite} ${frame.band} — Use zoom buttons to zoom`}
            className="max-h-full max-w-full select-none"
            style={{
              transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
              cursor: getCursorStyle(scale, dragging),
            }}
            draggable={false}
          />
        </button>

        {currentIndex < frames.length - 1 && (
          <button type="button" onClick={goNext} className="absolute right-4 z-10 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </dialog>
  );
}
