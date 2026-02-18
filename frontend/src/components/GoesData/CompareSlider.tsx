import { useRef, useCallback } from 'react';
import { Columns2 } from 'lucide-react';

interface CompareSliderProps {
  imageUrl: string;
  prevImageUrl: string | null;
  comparePosition: number;
  onPositionChange: (pos: number) => void;
  frameTime: string | null;
  prevFrameTime: string | null;
  timeAgo: (dateStr: string) => string;
}

export default function CompareSlider({
  imageUrl, prevImageUrl, comparePosition, onPositionChange,
  frameTime, prevFrameTime, timeAgo,
}: Readonly<CompareSliderProps>) {
  const compareContainerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      onPositionChange(Math.max(0, comparePosition - 1));
    } else if (e.key === 'ArrowRight') {
      onPositionChange(Math.min(100, comparePosition + 1));
    }
  }, [comparePosition, onPositionChange]);

  return (
    <div
      ref={compareContainerRef}
      className="relative w-full h-full select-none"
    >
      {/* Previous (background) */}
      {prevImageUrl ? (
        <img src={prevImageUrl} alt="Previous frame" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">No previous frame</div>
      )}
      {/* Current (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}>
        <img src={imageUrl} alt="Current frame" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      </div>
      {/* Native range input for accessibility */}
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(comparePosition)}
        onChange={(e) => onPositionChange(Number(e.target.value))}
        onKeyDown={handleKeyDown}
        aria-label="Compare frames slider"
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
      />
      {/* Slider handle (visual only) */}
      <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${comparePosition}%`, transform: 'translateX(-50%)' }}>
        <div className="w-0.5 h-full bg-white/80" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
          <Columns2 className="w-4 h-4 text-gray-800" />
        </div>
      </div>
      {/* Labels */}
      <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
        Previous{prevFrameTime ? ` · ${timeAgo(prevFrameTime)}` : ''}
      </div>
      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
        Current · {frameTime ? timeAgo(frameTime) : ''}
      </div>
    </div>
  );
}
