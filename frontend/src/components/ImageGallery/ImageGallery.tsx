import { useState, useEffect, useRef, useCallback } from 'react';
import { useImages, useDeleteImage } from '../../hooks/useApi';
import { X, Image as ImageIcon, Calendar, Satellite, Trash2, ImageOff } from 'lucide-react';

interface SatImage {
  id: string;
  filename: string;
  original_name: string;
  file_size: number;
  width: number;
  height: number;
  satellite: string;
  channel: string;
  captured_at: string;
  uploaded_at: string;
}

interface Props {
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}

export default function ImageGallery({ selectable, selected, onToggle }: Props) {
  const { data: images = [], isLoading } = useImages();
  const deleteImage = useDeleteImage();
  const [preview, setPreview] = useState<SatImage | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closePreview = useCallback(() => {
    setPreview(null);
    previousFocusRef.current?.focus();
  }, []);

  // Focus trap and escape key
  useEffect(() => {
    if (!preview) return;
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closePreview(); return; }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Auto-focus close button
    setTimeout(() => {
      const btn = modalRef.current?.querySelector<HTMLElement>('button');
      btn?.focus();
    }, 0);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [preview, closePreview]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square bg-slate-800 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if ((images as SatImage[]).length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No images uploaded yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {(images as SatImage[]).map((img) => (
          <div
            key={img.id}
            className={`group relative bg-slate-800 rounded-xl overflow-hidden cursor-pointer border-2 transition-colors ${
              selectable && selected?.has(img.id) ? 'border-primary' : 'border-transparent hover:border-slate-600'
            }`}
            onClick={() => (selectable && onToggle ? onToggle(img.id) : setPreview(img))}
          >
            <div className="aspect-square bg-slate-700 flex items-center justify-center relative">
              <img
                src={`/api/images/${img.id}/thumbnail`}
                alt={img.original_name}
                className="w-full h-full object-cover relative z-10"
                onError={(e) => {
                  const el = e.target as HTMLImageElement;
                  el.style.display = 'none';
                  const fallback = el.nextElementSibling;
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
              />
              <div className="absolute inset-0 flex-col items-center justify-center gap-1 hidden">
                <ImageOff className="w-8 h-8 text-slate-500" />
                <span className="text-xs text-slate-500">Image unavailable</span>
              </div>
            </div>
            {selectable && selected?.has(img.id) && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">✓</span>
              </div>
            )}
            <div className="p-2">
              <p className="text-xs truncate font-medium">{img.original_name}</p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                {img.satellite && (
                  <span className="flex items-center gap-0.5">
                    <Satellite className="w-3 h-3" />
                    {img.satellite}
                  </span>
                )}
                {img.captured_at && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="w-3 h-3" />
                    {new Date(img.captured_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            {!selectable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${img.original_name}"? This cannot be undone.`)) {
                    deleteImage.mutate(img.id);
                  }
                }}
                className="absolute top-2 right-2 p-1.5 bg-slate-900/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
          aria-label={`Image preview: ${preview.original_name}`}
          ref={modalRef}
        >
          <div
            className="bg-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-semibold truncate">{preview.original_name}</h3>
              <button onClick={closePreview} aria-label="Close preview">
                <X className="w-5 h-5 text-slate-400 hover:text-white" />
              </button>
            </div>
            <div className="p-4">
              <img
                src={`/api/images/${preview.id}/full`}
                alt={preview.original_name}
                className="w-full rounded-lg bg-slate-900"
              />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
                <Stat label="Resolution" value={`${preview.width}×${preview.height}`} />
                <Stat label="Satellite" value={preview.satellite || 'Unknown'} />
                <Stat label="Channel" value={preview.channel || 'Unknown'} />
                <Stat label="File Size" value={formatBytes(preview.file_size)} />
                <Stat label="Captured" value={preview.captured_at ? new Date(preview.captured_at).toLocaleString() : 'N/A'} />
                <Stat label="Uploaded" value={new Date(preview.uploaded_at).toLocaleString()} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-700/50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="font-medium text-sm mt-0.5">{value}</p>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
