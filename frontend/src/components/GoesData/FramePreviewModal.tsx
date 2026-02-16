import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Crop, Save } from 'lucide-react';
import api from '../../api/client';
import { formatBytes } from './utils';
import Modal from './Modal';
import type { GoesFrame, CropPreset } from './types';
import { extractArray } from '../../utils/safeData';

export default function FramePreviewModal({
  frame,
  onClose,
  allFrames,
  onNavigate,
}: Readonly<{
  frame: GoesFrame;
  onClose: () => void;
  allFrames?: GoesFrame[];
  onNavigate?: (frame: GoesFrame) => void;
}>) {
  const queryClient = useQueryClient();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);

  // Keyboard navigation between frames
  useEffect(() => {
    if (!allFrames || !onNavigate) return;
    const handler = (e: KeyboardEvent) => {
      const idx = allFrames.findIndex((f) => f.id === frame.id);
      if (idx === -1) return;
      if (e.key === 'ArrowRight' && idx < allFrames.length - 1) {
        e.preventDefault();
        onNavigate(allFrames[idx + 1]);
      } else if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        onNavigate(allFrames[idx - 1]);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [frame, allFrames, onNavigate]);

  const { data: cropPresets } = useQuery<CropPreset[]>({
    queryKey: ['crop-presets'],
    queryFn: () => api.get('/goes/crop-presets').then((r) => {
      return extractArray(r.data);
    }),
  });

  const saveCropPresetMutation = useMutation({
    mutationFn: (data: { name: string; x: number; y: number; width: number; height: number }) =>
      api.post('/goes/crop-presets', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crop-presets'] });
      setShowSavePreset(false);
      setPresetName('');
    },
  });

  const screenToImage = useCallback((clientX: number, clientY: number) => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return { x: 0, y: 0 };

    const rect = img.getBoundingClientRect();
    const scaleX = (frame.width || img.naturalWidth) / rect.width;
    const scaleY = (frame.height || img.naturalHeight) / rect.height;
    const x = Math.max(0, Math.round((clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.round((clientY - rect.top) * scaleY));
    return { x, y };
  }, [frame.width, frame.height]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = screenToImage(e.clientX, e.clientY);
    setCropStart(pos);
    setCropRect(null);
    setIsDragging(true);
  }, [screenToImage]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !cropStart) return;
    const pos = screenToImage(e.clientX, e.clientY);
    const x = Math.min(cropStart.x, pos.x);
    const y = Math.min(cropStart.y, pos.y);
    const w = Math.abs(pos.x - cropStart.x);
    const h = Math.abs(pos.y - cropStart.y);
    setCropRect({ x, y, w, h });
  }, [isDragging, cropStart, screenToImage]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const applyCropPreset = (preset: CropPreset) => {
    setCropRect({ x: preset.x, y: preset.y, w: preset.width, h: preset.height });
  };

  const [imgDims, setImgDims] = useState<{ w: number; h: number; natW: number; natH: number } | null>(null);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    setImgDims({ w: rect.width, h: rect.height, natW: img.naturalWidth, natH: img.naturalHeight });
  }, []);

  const overlayStyle = cropRect && imgDims ? (() => {
    const imgW = frame.width || imgDims.natW;
    const imgH = frame.height || imgDims.natH;
    const scaleX = imgDims.w / imgW;
    const scaleY = imgDims.h / imgH;
    return {
      left: cropRect.x * scaleX,
      top: cropRect.y * scaleY,
      width: cropRect.w * scaleX,
      height: cropRect.h * scaleY,
    };
  })() : undefined;

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Frame Preview"
      overlayClassName="fixed inset-0 bg-black/40 dark:bg-black/80 flex items-center justify-center z-50 modal-overlay m-0 w-full h-full max-w-none max-h-none border-none"
      panelClassName="bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 w-full h-full sm:w-auto sm:h-auto sm:max-w-5xl sm:max-h-[90vh] overflow-hidden flex flex-col modal-panel"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-semibold">{frame.satellite} · {frame.band} · {frame.sector}</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">{new Date(frame.capture_time).toLocaleString()} · {formatBytes(frame.file_size)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close preview"><X className="w-5 h-5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white" /></button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <button
          type="button"
          ref={containerRef}
          aria-label="Crop area — click and drag to select region, Escape to clear"
          className="relative inline-block cursor-crosshair select-none bg-transparent border-none p-0 m-0 outline-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setCropRect(null); }
          }}
        >
          <img
            ref={imgRef}
            src={frame.thumbnail_path
              ? `/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`
              : `/api/download?path=${encodeURIComponent(frame.file_path)}`}
            alt={`${frame.satellite} ${frame.band}`}
            className="max-w-full max-h-[60vh] rounded"
            loading="lazy"
            draggable={false}
            onLoad={handleImageLoad}
          />
          {overlayStyle && (
            <div
              className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
              style={{
                left: overlayStyle.left,
                top: overlayStyle.top,
                width: overlayStyle.width,
                height: overlayStyle.height,
              }}
            />
          )}
        </button>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800 space-y-3">
        {cropRect && (
          <div className="flex items-center gap-4 text-sm">
            <Crop className="w-4 h-4 text-primary" />
            <span className="text-gray-600 dark:text-slate-300">
              X: <span className="text-gray-900 dark:text-white font-mono">{cropRect.x}</span> &nbsp;
              Y: <span className="text-gray-900 dark:text-white font-mono">{cropRect.y}</span> &nbsp;
              W: <span className="text-gray-900 dark:text-white font-mono">{cropRect.w}</span> &nbsp;
              H: <span className="text-gray-900 dark:text-white font-mono">{cropRect.h}</span>
            </span>
            <button type="button"
              onClick={() => setShowSavePreset(true)}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-primary/20 text-primary rounded-lg hover:bg-primary/30"
            >
              <Save className="w-3 h-3" /> Save Preset
            </button>
            <button type="button"
              onClick={() => setCropRect(null)}
              className="text-xs text-gray-400 dark:text-slate-500 hover:text-gray-900 dark:hover:text-white"
            >
              Clear
            </button>
          </div>
        )}

        {showSavePreset && cropRect && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name (e.g. San Diego)"
              className="flex-1 rounded-lg bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white px-3 py-1.5 text-sm"
            />
            <button type="button"
              onClick={() => saveCropPresetMutation.mutate({
                name: presetName, x: cropRect.x, y: cropRect.y, width: cropRect.w, height: cropRect.h,
              })}
              disabled={!presetName || saveCropPresetMutation.isPending}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-gray-900 dark:text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50"
            >
              {saveCropPresetMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowSavePreset(false)} className="text-xs text-gray-500 dark:text-slate-400">Cancel</button>
          </div>
        )}

        {cropPresets && cropPresets.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 dark:text-slate-500">Presets:</span>
            {cropPresets.map((p) => (
              <button type="button"
                key={p.id}
                onClick={() => applyCropPreset(p)}
                className="px-2 py-1 text-xs bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded hover:bg-gray-100 dark:hover:bg-gray-200 dark:bg-slate-700 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
