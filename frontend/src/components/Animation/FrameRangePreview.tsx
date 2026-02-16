import { Satellite, ImageOff } from 'lucide-react';
import type { PreviewRangeResponse } from './types';

interface Props {
  data: PreviewRangeResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

function SkeletonCard() {
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="aspect-video bg-gray-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      <div className="h-3 w-24 bg-gray-200 dark:bg-slate-700 rounded mt-2 animate-pulse" />
    </div>
  );
}

export default function FrameRangePreview({ data, isLoading, isError }: Readonly<Props>) {
  if (isLoading) {
    return (
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-800">
        <div className="flex gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="h-4 w-32 bg-gray-200 dark:bg-slate-700 rounded mt-3 animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800 text-center text-red-600 dark:text-red-400 text-sm">
        Failed to load frame preview.
      </div>
    );
  }

  if (!data || data.frames.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 text-center">
        <ImageOff className="w-8 h-8 text-gray-400 dark:text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500 dark:text-slate-400">No frames found in this range.</p>
      </div>
    );
  }

  const labels = ['First', 'Middle', 'Last'];

  return (
    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-800 space-y-3">
      <div className="flex gap-4 overflow-x-auto">
        {data.frames.map((frame, i) => (
          <div key={frame.id} className="flex-1 min-w-[120px]">
            <div className="relative aspect-video bg-gray-200 dark:bg-slate-800 rounded-lg overflow-hidden">
              {frame.thumbnail_url ? (
                <img
                  src={frame.thumbnail_url}
                  alt={`${labels[i]} frame`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Satellite className="w-6 h-6 text-gray-400 dark:text-slate-600" />
                </div>
              )}
              <span className="absolute top-1 left-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
                {labels[i]}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 truncate">
              {new Date(frame.capture_time).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-gray-600 dark:text-slate-300 font-medium">
        {data.total_count} frames in range
        {data.capture_interval_minutes > 0 && (
          <span className="text-gray-400 dark:text-slate-500 font-normal">
            {' '}· ~{data.capture_interval_minutes}min interval
          </span>
        )}
      </p>
    </div>
  );
}
