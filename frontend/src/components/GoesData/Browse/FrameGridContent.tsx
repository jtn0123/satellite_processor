import { Satellite } from 'lucide-react';
import type { GoesFrame } from '../types';
import EmptyState from '../EmptyState';
import FrameCard from '../FrameCard';

interface FrameGridContentProps {
  isLoading: boolean;
  frames: GoesFrame[];
  viewMode: 'grid' | 'list';
  selectedIds: Set<string>;
  onFrameClick: (frame: GoesFrame, e: React.MouseEvent) => void;
  onView: (frame: GoesFrame) => void;
  onDownload: (frame: GoesFrame) => void;
  onCompare: (frame: GoesFrame) => void;
  onTag: (frame: GoesFrame) => void;
  onAddToCollection: (frame: GoesFrame) => void;
  onDelete: (frame: GoesFrame) => void;
}

export default function FrameGridContent({
  isLoading,
  frames,
  viewMode,
  selectedIds,
  onFrameClick,
  onView,
  onDownload,
  onCompare,
  onTag,
  onAddToCollection,
  onDelete,
}: Readonly<FrameGridContentProps>) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
          <div
            key={key}
            className="card overflow-hidden"
          >
            <div className="aspect-video skeleton-shimmer rounded-t" />
            <div className="p-2 space-y-2">
              <div className="h-3 skeleton-shimmer rounded w-3/4" />
              <div className="h-3 skeleton-shimmer rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (frames.length === 0) {
    return (
      <EmptyState
        icon={<Satellite className="w-8 h-8" />}
        title="No frames yet"
        description="Fetch satellite data to start browsing frames. Head over to the Fetch tab to download GOES imagery."
        action={{
          label: 'Go to Fetch Tab',
          onClick: () =>
            globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' })),
        }}
      />
    );
  }
  if (viewMode === 'grid') {
    return (
      <ul
        aria-label="Satellite frames"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 list-none p-0 m-0"
      >
        {frames.map((frame) => (
          <li key={frame.id} className="cv-auto @container">
            <FrameCard
              frame={frame}
              isSelected={selectedIds.has(frame.id)}
              onClick={onFrameClick}
              onView={onView}
              onDownload={onDownload}
              onCompare={onCompare}
              onTag={onTag}
              onAddToCollection={onAddToCollection}
              onDelete={onDelete}
              viewMode="grid"
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-label="Satellite frames" className="space-y-1 list-none p-0 m-0">
      {frames.map((frame) => (
        <li key={frame.id} className="cv-auto-list">
          <FrameCard
            frame={frame}
            isSelected={selectedIds.has(frame.id)}
            onClick={onFrameClick}
            onView={onView}
            onDownload={onDownload}
            onCompare={onCompare}
            onTag={onTag}
            onAddToCollection={onAddToCollection}
            onDelete={onDelete}
            viewMode="list"
          />
        </li>
      ))}
    </ul>
  );
}
