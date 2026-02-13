import { memo } from 'react';
import { Satellite, CheckCircle } from 'lucide-react';
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
      className={`relative bg-slate-800 rounded-xl border overflow-hidden cursor-pointer transition-all hover:bg-slate-700 ${
        isSelected ? 'border-primary ring-1 ring-primary' : 'border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="aspect-video bg-slate-800 flex items-center justify-center">
        {frame.thumbnail_path ? (
          <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band}`}
            loading="lazy"
            className="w-full h-full object-cover" />
        ) : (
          <Satellite className="w-8 h-8 text-slate-600" />
        )}
      </div>
      <div className="p-2 space-y-1">
        <div className="text-xs font-medium text-white truncate">
          {frame.satellite} · {frame.band} · {frame.sector}
        </div>
        <div className="text-xs text-slate-500">
          {new Date(frame.capture_time).toLocaleString()}
        </div>
        <div className="text-xs text-slate-600">{formatBytes(frame.file_size)}</div>
        {frame.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {frame.tags.map((t) => (
              <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-white"
                style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
            ))}
          </div>
        )}
      </div>
      {isSelected && (
        <div className="absolute top-2 left-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
          <CheckCircle className="w-3.5 h-3.5 text-white" />
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
        isSelected ? 'bg-primary/10 border border-primary/30' : 'bg-slate-900 border border-slate-800 hover:bg-slate-800/50'
      }`}
    >
      <div className="w-16 h-10 rounded bg-slate-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {frame.thumbnail_path ? (
          <img src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band} thumbnail`} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <Satellite className="w-4 h-4 text-slate-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{frame.satellite} · {frame.band} · {frame.sector}</div>
        <div className="text-xs text-slate-500">{new Date(frame.capture_time).toLocaleString()}</div>
      </div>
      <div className="text-xs text-slate-500">{formatBytes(frame.file_size)}</div>
      {frame.width && frame.height && (
        <div className="text-xs text-slate-600">{frame.width}×{frame.height}</div>
      )}
      <div className="flex gap-1">
        {frame.tags.map((t) => (
          <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-white"
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
