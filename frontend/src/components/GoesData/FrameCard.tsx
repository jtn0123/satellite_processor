import { memo } from 'react';
import { Satellite, CheckCircle, Search } from 'lucide-react';
import { formatBytes } from './utils';
import type { GoesFrame } from './types';

interface FrameCardProps {
  frame: GoesFrame;
  isSelected: boolean;
  onClick: (frame: GoesFrame, e: React.MouseEvent) => void;
  viewMode: 'grid' | 'list';
}

function FrameCardGrid({ frame, isSelected, onClick }: Omit<FrameCardProps, 'viewMode'>) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onClick(frame, e)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(frame, e as unknown as React.MouseEvent); } }}
      aria-label={`${frame.satellite} ${frame.band} ${frame.sector} frame from ${new Date(frame.capture_time).toLocaleString()}`}
      className={`relative bg-gray-100 dark:bg-slate-800 rounded-xl border overflow-hidden cursor-pointer transition-all inset-shadow-sm dark:inset-shadow-white/5 hover:bg-gray-100 dark:hover:bg-slate-800 dark:bg-slate-700 ${
        isSelected ? 'border-primary ring-1 ring-primary glow-primary' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-gray-300 dark:border-slate-600'
      }`}
    >
      <div className="aspect-video bg-gray-100 dark:bg-slate-800 flex items-center justify-center relative group/img">
        {frame.thumbnail_path ? (
          <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band}`}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover" />
        ) : (
          <Satellite className="w-8 h-8 text-gray-400 dark:text-slate-600" />
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
          <Search className="w-6 h-6 text-gray-900 dark:text-white" />
        </div>
      </div>
      {/* Compact layout for narrow containers, expanded for wide */}
      <div className="p-2 space-y-1 @max-[280px]:p-1.5 @max-[280px]:space-y-0.5">
        <div className="text-xs font-medium text-gray-900 dark:text-white truncate text-shadow-overlay">
          {frame.satellite} · {frame.band} · {frame.sector}
        </div>
        <div className="text-xs text-gray-400 dark:text-slate-500 @max-[280px]:hidden text-shadow-overlay">
          {new Date(frame.capture_time).toLocaleString()}
        </div>
        <div className="text-xs text-gray-400 dark:text-slate-600">{formatBytes(frame.file_size)}</div>
        {frame.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap @max-[280px]:hidden">
            {frame.tags.map((t) => (
              <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-gray-900 dark:text-white"
                style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
            ))}
          </div>
        )}
      </div>
      {isSelected && (
        <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
          <CheckCircle className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
        </div>
      )}
    </div>
  );
}

function FrameCardList({ frame, isSelected, onClick }: Omit<FrameCardProps, 'viewMode'>) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onClick(frame, e)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(frame, e as unknown as React.MouseEvent); } }}
      aria-label={`${frame.satellite} ${frame.band} ${frame.sector} frame from ${new Date(frame.capture_time).toLocaleString()}`}
      className={`flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors min-h-[44px] ${
        isSelected ? 'bg-primary/10 border border-primary/30 glow-primary' : 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-100/50 dark:bg-slate-800/50'
      }`}
    >
      <div className="w-16 h-10 rounded bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
        {frame.thumbnail_path ? (
          <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band} thumbnail`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <Satellite className="w-4 h-4 text-gray-400 dark:text-slate-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 dark:text-white">{frame.satellite} · {frame.band} · {frame.sector}</div>
        <div className="text-xs text-gray-400 dark:text-slate-500">{new Date(frame.capture_time).toLocaleString()}</div>
      </div>
      <div className="text-xs text-gray-400 dark:text-slate-500">{formatBytes(frame.file_size)}</div>
      {frame.width && frame.height && (
        <div className="text-xs text-gray-400 dark:text-slate-600">{frame.width}×{frame.height}</div>
      )}
      <div className="flex gap-1">
        {frame.tags.map((t) => (
          <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-gray-900 dark:text-white"
            style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
        ))}
      </div>
    </div>
  );
}

const FrameCard = memo(function FrameCard({ frame, isSelected, onClick, viewMode }: FrameCardProps) {
  if (viewMode === 'list') {
    return <FrameCardList frame={frame} isSelected={isSelected} onClick={onClick} />;
  }
  return <FrameCardGrid frame={frame} isSelected={isSelected} onClick={onClick} />;
});

export default FrameCard;
