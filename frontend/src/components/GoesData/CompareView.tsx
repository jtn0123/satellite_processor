import { useState, useCallback, useRef, useEffect } from 'react';
import type { GoesFrame } from './types';

interface CompareViewProps {
  frameA: GoesFrame;
  frameB: GoesFrame;
  onClose: () => void;
}

export default function CompareView({ frameA, frameB, onClose }: Readonly<CompareViewProps>) {
  const [sliderPos, setSliderPos] = useState(50);
  const [mode, setMode] = useState<'slider' | 'side-by-side'>('side-by-side');
  const containerRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleSliderMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPos(Math.max(0, Math.min(100, pct)));
    },
    [],
  );

  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    globalThis.addEventListener('keydown', handler);
    // Focus first button
    setTimeout(() => dialogRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatTime = (t: string) => new Date(t).toLocaleString();

  return (
    <dialog ref={dialogRef} open aria-label="Compare frames" className="fixed inset-0 z-50 bg-black/90 flex flex-col text-white m-0 w-full h-full max-w-none max-h-none border-none p-0">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Compare Frames</h2>
          <button
            onClick={() => setMode('side-by-side')}
            className={`px-3 py-1 rounded text-sm ${mode === 'side-by-side' ? 'bg-primary text-black' : 'bg-white/10'}`}
          >
            Side by Side
          </button>
          <button
            onClick={() => setMode('slider')}
            className={`px-3 py-1 rounded text-sm ${mode === 'slider' ? 'bg-primary text-black' : 'bg-white/10'}`}
          >
            Slider
          </button>
        </div>
        <button onClick={onClose} className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg">
          Close
        </button>
      </div>

      {/* Labels */}
      <div className="flex px-4 pb-2 gap-4 text-sm text-white/70">
        <div className="flex-1">
          {frameA.satellite} · {frameA.band} · {formatTime(frameA.capture_time)}
        </div>
        <div className="flex-1 text-right">
          {frameB.satellite} · {frameB.band} · {formatTime(frameB.capture_time)}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        {mode === 'side-by-side' ? (
          <div className="flex gap-2 h-full">
            <div className="flex-1 flex items-center justify-center">
              <img
                src={`/api/goes/frames/${frameA.id}/image`}
                alt="Frame A"
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <img
                src={`/api/goes/frames/${frameB.id}/image`}
                alt="Frame B"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="relative h-full w-full overflow-hidden cursor-col-resize select-none"
            onMouseMove={dragging ? handleSliderMove : undefined}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
          >
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sliderPos)}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              aria-label="Image comparison slider"
              className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-20"
            />
            {/* Frame B (full background) */}
            <img
              src={`/api/goes/frames/${frameB.id}/image`}
              alt="Frame B"
              className="absolute inset-0 w-full h-full object-contain"
            />
            {/* Frame A (clipped) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPos}%` }}
            >
              <img
                src={`/api/goes/frames/${frameA.id}/image`}
                alt="Frame A"
                className="absolute inset-0 w-full h-full object-contain"
                style={{ width: '100%' }}
              />
            </div>
            {/* Divider */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-col-resize"
              style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-black text-xs font-bold">⟷</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
