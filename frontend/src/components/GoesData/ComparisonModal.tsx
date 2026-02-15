import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ArrowLeftRight, Columns, SlidersHorizontal } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface GoesFrame {
  id: string;
  satellite: string;
  sector: string;
  band: string;
  capture_time: string;
  file_path: string;
  file_size: number;
  thumbnail_path: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function ComparisonModal({
  frameA,
  frameB,
  onClose,
}: Readonly<{
  frameA: GoesFrame;
  frameB: GoesFrame;
  onClose: () => void;
}>) {
  const [mode, setMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [swapped, setSwapped] = useState(false);
  const [sliderPos, setSliderPos] = useState(50);
  const sliderRef = useRef<HTMLDivElement>(null);
  const dialogRef = useFocusTrap(onClose);

  useEffect(() => {
    const handler = () => onClose();
    globalThis.addEventListener('close-modal', handler);
    return () => globalThis.removeEventListener('close-modal', handler);
  }, [onClose]);
  const isDragging = useRef(false);

  const left = swapped ? frameB : frameA;
  const right = swapped ? frameA : frameB;

  const getUrl = (frame: GoesFrame) =>
    `/api/download?path=${encodeURIComponent(frame.thumbnail_path || frame.file_path)}`;

  const handleSliderMove = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) handleSliderMove(e);
    };
    const handleMouseUp = () => { isDragging.current = false; };
    globalThis.addEventListener('mousemove', handleMouseMove);
    globalThis.addEventListener('mouseup', handleMouseUp);
    return () => {
      globalThis.removeEventListener('mousemove', handleMouseMove);
      globalThis.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleSliderMove]);

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/80 flex items-center justify-center z-50 modal-overlay" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-label="Compare Frames" aria-modal="true"
        className="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col modal-panel"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold">Compare Frames</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode('side-by-side')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                mode === 'side-by-side' ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}>
              <Columns className="w-4 h-4" /> Side by Side
            </button>
            <button onClick={() => setMode('slider')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                mode === 'slider' ? 'bg-primary text-gray-900 dark:text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}>
              <SlidersHorizontal className="w-4 h-4" /> Slider
            </button>
            <button onClick={() => setSwapped(!swapped)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white transition-colors">
              <ArrowLeftRight className="w-4 h-4" /> Swap
            </button>
            <button onClick={onClose} aria-label="Close comparison">
              <X className="w-5 h-5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {mode === 'side-by-side' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
              {[left, right].map((frame, idx) => (
                <div key={frame.id + idx} className="flex flex-col">
                  <div className="text-xs text-gray-500 dark:text-slate-400 mb-2 text-center">
                    <span className="font-medium text-gray-900 dark:text-white">{frame.satellite}</span> · {frame.band} · {frame.sector}
                    <br />
                    {new Date(frame.capture_time).toLocaleString()} · {formatBytes(frame.file_size)}
                  </div>
                  <div className="flex-1 bg-black rounded-lg overflow-hidden flex items-center justify-center">
                    <img src={getUrl(frame)} alt={`Frame ${idx + 1}`} loading="lazy" decoding="async"
                      className="max-w-full max-h-[60vh] object-contain" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400">
                <span>
                  <span className="font-medium text-gray-900 dark:text-white">{left.satellite}</span> · {left.band} · {new Date(left.capture_time).toLocaleString()}
                </span>
                <span>
                  <span className="font-medium text-gray-900 dark:text-white">{right.satellite}</span> · {right.band} · {new Date(right.capture_time).toLocaleString()}
                </span>
              </div>
              <div
                ref={sliderRef}
                className="relative bg-black rounded-lg overflow-hidden cursor-col-resize select-none"
                style={{ height: '60vh' }}
                onClick={handleSliderMove}
              >
                {/* Right image (full) */}
                <img src={getUrl(right)} alt="Right" loading="lazy" decoding="async"
                  className="absolute inset-0 w-full h-full object-contain" />
                {/* Left image (clipped) */}
                <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                  <img src={getUrl(left)} alt="Left" loading="lazy" decoding="async"
                    className="w-full h-full object-contain" />
                </div>
                {/* Slider handle */}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(sliderPos)}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  aria-label="Image comparison slider"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-20"
                />
                <div
                  className="absolute top-0 bottom-0 w-1 bg-white/80 cursor-col-resize z-10 pointer-events-none"
                  style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
                  onMouseDown={handleMouseDown}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg">
                    <ArrowLeftRight className="w-4 h-4 text-slate-800" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
