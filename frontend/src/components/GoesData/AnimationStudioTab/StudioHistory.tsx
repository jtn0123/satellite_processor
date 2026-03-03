import { Trash2 } from 'lucide-react';
import { formatBytes } from '../utils';
import type { PaginatedAnimations } from '../types';

interface StudioHistoryProps {
  readonly animations: PaginatedAnimations | undefined;
  readonly onDelete: (id: string) => void;
}

export function StudioHistory({ animations, onDelete }: StudioHistoryProps) {
  const items = animations?.items ?? [];

  return (
    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
      <h3 className="text-lg font-semibold">Animation History</h3>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((anim) => (
            <div key={anim.id} className="flex items-center gap-4 bg-gray-100/50 dark:bg-slate-800/50 rounded-lg px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">{anim.name}</div>
                <div className="text-xs text-gray-400 dark:text-slate-500">
                  {anim.frame_count} frames · {anim.fps} FPS · {anim.format.toUpperCase()} · {anim.quality}
                  {anim.file_size > 0 && ` · ${formatBytes(anim.file_size)}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {anim.status === 'pending' && (
                  <span className="px-2 py-1 text-xs bg-amber-600/20 text-amber-400 rounded">Pending</span>
                )}
                {anim.status === 'processing' && (
                  <span className="px-2 py-1 text-xs bg-primary/20 text-primary rounded animate-pulse">Processing</span>
                )}
                {anim.status === 'completed' && (
                  <>
                    <span className="px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded">Done</span>
                    {anim.output_path && (
                      <a href={`/api/download?path=${encodeURIComponent(anim.output_path)}`}
                        download className="text-xs text-primary hover:underline">Download</a>
                    )}
                  </>
                )}
                {anim.status === 'failed' && (
                  <span className="px-2 py-1 text-xs bg-red-600/20 text-red-400 rounded" title={anim.error}>Failed</span>
                )}
                <button onClick={() => onDelete(anim.id)}
                  className="p-1 text-gray-400 dark:text-slate-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-400 dark:text-slate-500 py-8">
          No animations yet. Configure settings and generate one above!
        </div>
      )}
    </div>
  );
}
