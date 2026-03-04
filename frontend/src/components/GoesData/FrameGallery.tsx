import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Image, Columns2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { GoesFrame, PaginatedFrames } from './types';
import ImageViewer from './ImageViewer';
import CompareView from './CompareView';
import api from '../../api/client';

export default function FrameGallery() {
  const [satellite, setSatellite] = useState('');
  const [band, setBand] = useState('');
  const [page, setPage] = useState(1);
  const [viewerFrame, setViewerFrame] = useState<GoesFrame | null>(null);
  const [compareFrames, setCompareFrames] = useState<GoesFrame[]>([]);
  const [compareMode, setCompareMode] = useState(false);

  const { data, isLoading } = useQuery<PaginatedFrames>({
    queryKey: ['gallery-frames', satellite, band, page],
    queryFn: () =>
      api
        .get('/satellite/frames', {
          params: {
            page,
            limit: 24,
            ...(satellite && { satellite }),
            ...(band && { band }),
            sort: 'capture_time',
            order: 'desc',
          },
        })
        .then((r) => r.data),
  });

  const frames = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / data.limit) : 0;

  const { data: statsData } = useQuery({
    queryKey: ['frame-stats-filters'],
    queryFn: () => api.get('/satellite/frames/stats').then((r) => r.data),
  });

  const satellites = statsData ? Object.keys(statsData.by_satellite) : [];
  const bands = statsData ? Object.keys(statsData.by_band) : [];

  const toggleCompareSelect = (frame: GoesFrame) => {
    setCompareFrames((prev) => {
      const exists = prev.find((f) => f.id === frame.id);
      if (exists) return prev.filter((f) => f.id !== frame.id);
      if (prev.length >= 2) return [prev[1], frame];
      return [...prev, frame];
    });
  };

  const formatTime = (t: string) => {
    const d = new Date(t);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={satellite}
          onChange={(e) => { setSatellite(e.target.value); setPage(1); }}
          aria-label="Filter by satellite"
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden"
        >
          <option value="">All Satellites</option>
          {satellites.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={band}
          onChange={(e) => { setBand(e.target.value); setPage(1); }}
          aria-label="Filter by band"
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden"
        >
          <option value="">All Bands</option>
          {bands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <button
          onClick={() => setCompareMode(!compareMode)}
          aria-pressed={compareMode}
          aria-label={`Compare mode${compareMode && compareFrames.length > 0 ? `, ${compareFrames.length} of 2 selected` : ''}`}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${
            compareMode
              ? 'bg-primary text-gray-900 dark:text-white'
              : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
          }`}
        >
          <Columns2 className="w-4 h-4" aria-hidden="true" />
          Compare {compareMode && compareFrames.length > 0 ? `(${compareFrames.length}/2)` : ''}
        </button>

        <span className="text-sm text-gray-500 dark:text-slate-400 ml-auto">
          {data?.total ?? 0} frames
        </span>
      </div>

      {/* Grid */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {['a','b','c','d','e','f','g','h','i','j','k','l'].map((id) => (
            <div key={`skel-${id}`} className="aspect-square bg-gray-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}
      {!isLoading && frames.length === 0 && (
        <div className="flex flex-col items-center py-16 text-gray-400 dark:text-slate-500">
          <Image className="w-12 h-12 mb-3" />
          <p>No frames found</p>
        </div>
      )}
      {!isLoading && frames.length > 0 && (
        <div role="grid" aria-label="Satellite image gallery" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {frames.map((frame) => {
            const isSelected = compareFrames.some((f) => f.id === frame.id);
            return (
              <button
                key={frame.id}
                onClick={() => (compareMode ? toggleCompareSelect(frame) : setViewerFrame(frame))}
                aria-label={`${frame.satellite} ${frame.band} — ${formatTime(frame.capture_time)}${compareMode ? (isSelected ? ', selected for comparison' : ', select for comparison') : ', click to view'}`}
                className={`group relative rounded-xl overflow-hidden border transition-all hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/50'
                    : 'border-gray-200 dark:border-slate-700 hover:border-primary/50'
                }`}
              >
                <div className="aspect-square bg-gray-100 dark:bg-slate-800">
                  <img
                    src={`/api/satellite/frames/${frame.id}/thumbnail`}
                    alt={`${frame.satellite} ${frame.band} — ${formatTime(frame.capture_time)}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left" aria-hidden="true">
                  <p className="text-xs font-medium text-white">{frame.satellite} · {frame.band}</p>
                  <p className="text-[10px] text-white/70">{formatTime(frame.capture_time)}</p>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-black text-xs font-bold" aria-hidden="true">
                    {compareFrames.findIndex((f) => f.id === frame.id) + 1}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination -- keeping same structure */}
      {totalPages > 1 && (
        <nav aria-label="Gallery pagination" className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-sm text-gray-600 dark:text-slate-400" aria-live="polite">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-hidden"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </nav>
      )}

      {/* Viewer overlay */}
      {viewerFrame && (
        <ImageViewer
          frame={viewerFrame}
          frames={frames}
          onClose={() => setViewerFrame(null)}
          onNavigate={setViewerFrame}
        />
      )}

      {/* Compare overlay */}
      {compareMode && compareFrames.length === 2 && (
        <CompareView
          frameA={compareFrames[0]}
          frameB={compareFrames[1]}
          onClose={() => { setCompareFrames([]); setCompareMode(false); }}
        />
      )}
    </div>
  );
}
