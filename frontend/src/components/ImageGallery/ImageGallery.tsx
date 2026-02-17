import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useImages, useDeleteImage } from '../../hooks/useApi';
import { formatBytes } from '../../utils/format';
import { X, Image as ImageIcon, Calendar, Satellite, Trash2, ImageOff, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

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

type SortField = 'uploaded_at' | 'original_name' | 'satellite';
type SortDir = 'asc' | 'desc';

interface Props {
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}

export default function ImageGallery({ selectable, selected, onToggle }: Readonly<Props>) {
  const { data: images = [], isLoading } = useImages();
  const deleteImage = useDeleteImage();
  const [preview, setPreview] = useState<SatImage | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Sort & filter state
  const [sortField, setSortField] = useState<SortField>('uploaded_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterSatellite, setFilterSatellite] = useState('');
  const [filterChannel, setFilterChannel] = useState('');

  const allImages = images as SatImage[];

  // Derive unique satellites and channels
  const satellites = useMemo(
    () => [...new Set(allImages.map((i) => i.satellite).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [allImages]
  );
  const channels = useMemo(
    () => [...new Set(allImages.map((i) => i.channel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [allImages]
  );

  // Filter and sort
  const displayed = useMemo(() => {
    let result = [...allImages];
    if (filterSatellite) result = result.filter((i) => i.satellite === filterSatellite);
    if (filterChannel) result = result.filter((i) => i.channel === filterChannel);
    result.sort((a, b) => {
      const aVal = a[sortField] ?? '';
      const bVal = b[sortField] ?? '';
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [allImages, filterSatellite, filterChannel, sortField, sortDir]);

  const closePreview = useCallback(() => {
    setPreview(null);
    previousFocusRef.current?.focus();
  }, []);

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
    setTimeout(() => modalRef.current?.querySelector<HTMLElement>('button')?.focus(), 0);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [preview, closePreview]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {["a","b","c","d","e","f","g","h"].map((k) => (
          <div key={k} className="aspect-square bg-white dark:bg-space-800/70 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (allImages.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-slate-500">
        <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>No images uploaded yet</p>
      </div>
    );
  }

  return (
    <>
      {/* Sort & Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="w-4 h-4 text-gray-500 dark:text-slate-400" />
          {([
            ['uploaded_at', 'Date'],
            ['original_name', 'Name'],
            ['satellite', 'Satellite'],
          ] as [SortField, string][]).map(([field, label]) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                sortField === field
                  ? 'bg-primary/10 text-primary'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:bg-space-800'
              }`}
            >
              {label} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
            </button>
          ))}
        </div>

        {(satellites.length > 0 || channels.length > 0) && (
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-gray-500 dark:text-slate-400" />
            {satellites.length > 0 && (
              <select
                aria-label="Filter by satellite"
                value={filterSatellite}
                onChange={(e) => setFilterSatellite(e.target.value)}
                className="bg-gray-100 dark:bg-space-800 border border-gray-200 dark:border-space-700/50 rounded-lg px-2 py-1 text-xs"
              >
                <option value="">All Satellites</option>
                {satellites.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
            {channels.length > 0 && (
              <select
                aria-label="Filter by channel"
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="bg-gray-100 dark:bg-space-800 border border-gray-200 dark:border-space-700/50 rounded-lg px-2 py-1 text-xs"
              >
                <option value="">All Channels</option>
                {channels.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {displayed.map((img) => (
          <div
            key={img.id}
            className={`group relative bg-white dark:bg-space-800/70 border rounded-xl overflow-hidden cursor-pointer transition-colors ${
              selectable && selected?.has(img.id) ? 'border-primary' : 'border-gray-200 dark:border-space-700/50 hover:border-space-600'
            }`}
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => (selectable && onToggle ? onToggle(img.id) : setPreview(img))}
            >
              <div className="aspect-square bg-gray-100 dark:bg-space-800 flex items-center justify-center relative">
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
                  <ImageOff className="w-8 h-8 text-gray-400 dark:text-slate-500" />
                  <span className="text-xs text-gray-400 dark:text-slate-500">Image unavailable</span>
                </div>
              </div>
              {selectable && selected?.has(img.id) && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center z-20">
                  <span className="text-gray-900 dark:text-white text-xs font-bold">✓</span>
                </div>
              )}
              <div className="p-2">
                <p className="text-xs truncate font-medium">{img.original_name}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500 dark:text-slate-400">
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
            </button>
            {!selectable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (globalThis.confirm(`Delete "${img.original_name}"? This cannot be undone.`)) {
                    deleteImage.mutate(img.id);
                  }
                }}
                className="absolute top-2 right-2 p-1.5 bg-white dark:bg-space-900/80 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 dark:text-slate-400 hover:text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Preview Modal */}
      {preview && (
        <dialog
          open
          className="fixed inset-0 bg-black/40 dark:bg-black/80 z-50 flex items-center justify-center p-4 m-0 w-full h-full max-w-none max-h-none border-none"
          onClick={closePreview}
          onKeyDown={(e) => { if (e.key === 'Escape') closePreview(); }}
          aria-label={`Image preview: ${preview.original_name}`}
          ref={modalRef}
        >
          <div
            role="presentation"
            className="bg-space-850 border border-gray-200 dark:border-space-700/50 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto text-left cursor-default"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-space-700/50">
              <h3 className="font-semibold truncate">{preview.original_name}</h3>
              <button onClick={closePreview} aria-label="Close preview" className="focus-ring rounded-lg p-1">
                <X className="w-5 h-5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white" />
              </button>
            </div>
            <div className="p-4">
              <img
                src={`/api/images/${preview.id}/full`}
                alt={preview.original_name}
                className="w-full rounded-lg bg-white dark:bg-space-900"
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
        </dialog>
      )}
    </>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="bg-space-700/50 border border-gray-200 dark:border-space-700/50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="font-medium text-sm mt-0.5">{value}</p>
    </div>
  );
}

// #169: formatBytes moved to shared utils/format.ts
