import { useState, useEffect, useCallback, useRef } from 'react';
import type { GoesFrame } from './types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Maximize,
  Minimize,
  X,
} from 'lucide-react';

interface AnimationPlayerProps {
  frames: GoesFrame[];
  onClose: () => void;
}

const SPEEDS = [0.5, 1, 2, 4];
const PRELOAD_AHEAD = 5;
const BASE_INTERVAL = 500; // ms at 1x

export default function AnimationPlayer({ frames, onClose }: Readonly<AnimationPlayerProps>) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDialogElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());

  const frameCount = frames.length;
  const currentFrame = frames[currentIndex];

  const imageUrl = useCallback(
    (frame: GoesFrame) => `/api/goes/frames/${frame.id}/image`,
    [],
  );

  // Preload frames ahead
  useEffect(() => {
    for (let i = 1; i <= PRELOAD_AHEAD; i++) {
      const idx = currentIndex + i;
      if (idx < frameCount) {
        const url = imageUrl(frames[idx]);
        if (!preloadedRef.current.has(url)) {
          const img = new Image();
          img.src = url;
          preloadedRef.current.add(url);
        }
      }
    }
  }, [currentIndex, frameCount, frames, imageUrl]);

  // Playback timer
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= frameCount - 1) {
            if (loop) return 0;
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, BASE_INTERVAL / speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, loop, frameCount]);

  const stepForward = useCallback(() => {
    setPlaying(false);
    setCurrentIndex((prev) => Math.min(prev + 1, frameCount - 1));
  }, [frameCount]);

  const stepBack = useCallback(() => {
    setPlaying(false);
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying((p) => !p);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        stepForward();
      } else if (e.key === 'ArrowLeft') {
        stepBack();
      } else if (e.key === 'Escape') {
        e.preventDefault(); // prevent native dialog close, we handle it
        if (fullscreen) {
          setFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [togglePlay, stepForward, stepBack, fullscreen, onClose]);

  // Fullscreen API
  const toggleFullscreen = useCallback(() => {
    if (!fullscreen && containerRef.current) {
      containerRef.current.requestFullscreen?.().catch(() => {
        // fallback: just toggle CSS fullscreen
      });
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }
    setFullscreen((f) => !f);
  }, [fullscreen]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Open dialog as modal for proper focus trapping
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof el.showModal === 'function' && !el.open) {
      el.showModal();
    } else if (!el.open) {
      el.open = true;
    }
    return () => {
      if (el.open) el.close();
    };
  }, []);

  if (frameCount === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
        <div className="text-white text-center">
          <p>No frames to animate</p>
          <button type="button" onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 rounded-lg min-h-[44px] min-w-[44px]">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <dialog
      ref={containerRef}
      className={`fixed inset-0 z-50 bg-space-900 flex flex-col m-0 w-full h-full max-w-none max-h-none border-none p-0 ${
        fullscreen ? '' : 'bg-black/95'
      }`}
      aria-label="Animation Player"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-space-800/80 border-b border-slate-700">
        <div className="text-sm text-slate-300">
          <span className="font-medium text-white">
            Frame {currentIndex + 1}/{frameCount}
          </span>
          {currentFrame && (
            <span className="ml-3 text-slate-400">
              {new Date(currentFrame.capture_time).toLocaleString()} · {currentFrame.satellite} · {currentFrame.band} · {currentFrame.sector}
            </span>
          )}
        </div>
        <button type="button"
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close player"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
        {currentFrame && (
          <img
            src={imageUrl(currentFrame)}
            alt={`Frame ${currentIndex + 1}: ${currentFrame.capture_time}`}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        )}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 bg-space-800/80 border-t border-slate-700 space-y-2">
        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={frameCount - 1}
          value={currentIndex}
          onChange={(e) => {
            setCurrentIndex(Number(e.target.value));
            setPlaying(false);
          }}
          className="w-full h-2 accent-sky-500 cursor-pointer"
          aria-label="Frame scrubber"
        />

        {/* Button row */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button type="button"
            onClick={stepBack}
            className="p-2 text-slate-300 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700"
            aria-label="Previous frame"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button type="button"
            onClick={togglePlay}
            className="p-3 bg-sky-600 hover:bg-sky-500 text-white rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
          </button>

          <button type="button"
            onClick={stepForward}
            className="p-2 text-slate-300 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700"
            aria-label="Next frame"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* Speed control */}
          <div className="flex items-center gap-1 ml-4">
            {SPEEDS.map((s) => (
              <button type="button"
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2 py-1 text-xs rounded min-h-[44px] min-w-[44px] flex items-center justify-center ${
                  speed === s
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
                aria-label={`Speed ${s}x`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Loop toggle */}
          <button type="button"
            onClick={() => setLoop((l) => !l)}
            className={`p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center ${
              loop
                ? 'text-sky-400 bg-sky-900/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            aria-label={loop ? 'Disable loop' : 'Enable loop'}
          >
            <Repeat className="w-5 h-5" />
          </button>

          {/* Fullscreen */}
          <button type="button"
            onClick={toggleFullscreen}
            className="p-2 text-slate-300 hover:text-white min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700"
            aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </dialog>
  );
}
