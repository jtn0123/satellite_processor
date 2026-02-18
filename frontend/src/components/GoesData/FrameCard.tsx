import { memo } from 'react';
import { Satellite, CheckCircle, Eye, Download } from 'lucide-react';
import { formatBytes } from './utils';
import type { GoesFrame } from './types';
import LazyImage from './LazyImage';
import FrameActionMenu from './FrameActionMenu';

export interface FrameCardProps {
  frame: GoesFrame;
  isSelected: boolean;
  onClick: (frame: GoesFrame, e: React.MouseEvent) => void;
  onView?: (frame: GoesFrame) => void;
  onDownload?: (frame: GoesFrame) => void;
  onCompare?: (frame: GoesFrame) => void;
  onTag?: (frame: GoesFrame) => void;
  onAddToCollection?: (frame: GoesFrame) => void;
  onDelete?: (frame: GoesFrame) => void;
  viewMode: 'grid' | 'list';
}

function formatCaptureTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = diffMs / 3600000;

  if (diffH < 24) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function FrameCardGrid({
  frame, isSelected, onClick, onView, onDownload, onCompare, onTag, onAddToCollection, onDelete,
}: Readonly<Omit<FrameCardProps, 'viewMode'>>) {
  return (
    <div
      className={`relative bg-gray-100 dark:bg-slate-800 rounded-xl border overflow-hidden transition-all inset-shadow-sm dark:inset-shadow-white/5 ${
        isSelected ? 'border-primary ring-1 ring-primary glow-primary' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
      }`}
    >
      {/* Thumbnail area — clickable */}
      <button
        type="button"
        onClick={(e) => onClick(frame, e)}
        aria-label={`${frame.satellite} ${frame.band} ${frame.sector} frame from ${new Date(frame.capture_time).toLocaleString()}`}
        className="w-full aspect-video bg-gray-100 dark:bg-slate-800 flex items-center justify-center relative group/img cursor-pointer"
      >
        {frame.thumbnail_path ? (
          <LazyImage
            src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band}`}
            className="w-full h-full"
          />
        ) : (
          <Satellite className="w-8 h-8 text-gray-400 dark:text-slate-600" />
        )}
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-2 left-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
            <CheckCircle className="w-4 h-4 text-gray-900 dark:text-white" />
          </div>
        )}
        {/* Satellite + Band badges overlaid on thumbnail */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm">
            {frame.satellite}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/60 text-white backdrop-blur-sm">
            {frame.band}
          </span>
        </div>
      </button>

      {/* Card body */}
      <div className="p-2.5 space-y-2">
        {/* Capture time — prominent */}
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {formatCaptureTime(frame.capture_time)}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
          <span>{frame.sector}</span>
          <span>·</span>
          <span>{formatBytes(frame.file_size)}</span>
        </div>

        {/* Tags */}
        {(frame.tags ?? []).length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {(frame.tags ?? []).map((t) => (
              <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-gray-900 dark:text-white"
                style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
            ))}
          </div>
        )}

        {/* Action row: primary visible, secondary in overflow */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-1">
            {/* View — primary */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onView?.(frame); }}
              className="flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="View frame"
            >
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            {/* Download — primary */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDownload?.(frame); }}
              className="flex items-center gap-1 px-2.5 py-1.5 min-h-[44px] text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
              aria-label="Download frame"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          </div>
          {/* Overflow menu — secondary actions */}
          <FrameActionMenu
            onCompare={() => onCompare?.(frame)}
            onTag={() => onTag?.(frame)}
            onAddToCollection={() => onAddToCollection?.(frame)}
            onDelete={() => onDelete?.(frame)}
          />
        </div>
      </div>
    </div>
  );
}

function FrameCardList({
  frame, isSelected, onClick, onView, onDownload, onCompare, onTag, onAddToCollection, onDelete,
}: Readonly<Omit<FrameCardProps, 'viewMode'>>) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors min-h-[44px] ${
        isSelected ? 'bg-primary/10 border border-primary/30 glow-primary' : 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:bg-gray-100/50 dark:hover:bg-slate-800/50'
      }`}
    >
      {/* Thumbnail */}
      <button
        type="button"
        onClick={(e) => onClick(frame, e)}
        className="w-16 h-10 rounded bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer min-w-[44px] min-h-[44px]"
        aria-label={`${frame.satellite} ${frame.band} ${frame.sector} frame from ${new Date(frame.capture_time).toLocaleString()}`}
      >
        {frame.thumbnail_path ? (
          <LazyImage
            src={`/api/download?path=${encodeURIComponent(frame.thumbnail_path)}`}
            alt={`${frame.satellite} ${frame.band} thumbnail`}
            className="w-full h-full"
          />
        ) : (
          <Satellite className="w-4 h-4 text-gray-400 dark:text-slate-600" />
        )}
      </button>

      {/* Info */}
      <button type="button" onClick={(e) => onClick(frame, e)} className="flex-1 min-w-0 text-left cursor-pointer">
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {formatCaptureTime(frame.capture_time)}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
          <span className="px-1 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-[10px] font-semibold">{frame.satellite}</span>
          <span className="px-1 py-0.5 rounded bg-gray-200 dark:bg-slate-700 text-[10px] font-semibold">{frame.band}</span>
          <span>{frame.sector}</span>
          <span>·</span>
          <span>{formatBytes(frame.file_size)}</span>
        </div>
      </button>

      {/* Tags */}
      <div className="hidden sm:flex gap-1">
        {(frame.tags ?? []).map((t) => (
          <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] text-gray-900 dark:text-white"
            style={{ backgroundColor: t.color + '40' }}>{t.name}</span>
        ))}
      </div>

      {/* Primary actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={(e) => { e.stopPropagation(); onView?.(frame); }}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-gray-500 dark:text-slate-400"
          aria-label="View frame">
          <Eye className="w-4 h-4" />
        </button>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDownload?.(frame); }}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-gray-500 dark:text-slate-400"
          aria-label="Download frame">
          <Download className="w-4 h-4" />
        </button>
        <FrameActionMenu
          onCompare={() => onCompare?.(frame)}
          onTag={() => onTag?.(frame)}
          onAddToCollection={() => onAddToCollection?.(frame)}
          onDelete={() => onDelete?.(frame)}
        />
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center shrink-0">
          <CheckCircle className="w-3.5 h-3.5 text-gray-900 dark:text-white" />
        </div>
      )}
    </div>
  );
}

const FrameCard = memo(function FrameCard(props: Readonly<FrameCardProps>) {
  if (props.viewMode === 'list') {
    return <FrameCardList {...props} />;
  }
  return <FrameCardGrid {...props} />;
});

export default FrameCard;
