import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2, Play, Loader2 } from 'lucide-react';
import api from '../../api/client';
import { showToast } from '../../utils/toast';
import type { AnimationConfig, BatchItem } from './types';

interface Props {
  currentConfig: AnimationConfig;
}

export default function BatchAnimationPanel({ currentConfig }: Readonly<Props>) {
  const [items, setItems] = useState<BatchItem[]>([]);

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), config: { ...currentConfig } },
    ]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const batchMutation = useMutation({
    mutationFn: () =>
      api
        .post('/goes/animations/batch', {
          animations: items.map((item) => ({
            satellite: item.config.satellite,
            sector: item.config.sector,
            band: item.config.band,
            start_date: item.config.start_date,
            end_date: item.config.end_date,
            fps: item.config.fps,
            format: item.config.format,
            quality: item.config.quality,
            resolution: item.config.resolution,
            loop_style: item.config.loop_style,
            overlays: item.config.overlays,
            name: item.config.name,
          })),
        })
        .then((r) => r.data),
    onSuccess: () => {
      showToast('success', `${items.length} animations queued!`);
      setItems([]);
    },
    onError: () => showToast('error', 'Batch generation failed'),
  });

  return (
    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-6 border border-gray-200 dark:border-slate-800 space-y-4">
      <h3 className="text-lg font-semibold">Batch Queue</h3>

      {items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">
          No items queued. Click &quot;Add another&quot; to queue animations with different parameters.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 bg-gray-100/50 dark:bg-slate-800/50 rounded-lg px-4 py-3"
            >
              <span className="text-xs text-gray-400 dark:text-slate-500 w-6">#{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white truncate">
                  {item.config.satellite} · {item.config.sector} · {item.config.band}
                </p>
                <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                  {item.config.start_date ? new Date(item.config.start_date).toLocaleString() : '?'} →{' '}
                  {item.config.end_date ? new Date(item.config.end_date).toLocaleString() : '?'}
                </p>
              </div>
              <span className="text-xs text-gray-500 dark:text-slate-400">
                {item.config.format.toUpperCase()} · {item.config.quality}
              </span>
              <button
                onClick={() => removeItem(item.id)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 dark:text-slate-500 hover:text-red-400 transition-colors"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={addItem}
          className="min-h-[44px] flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-primary/20 hover:text-primary transition-colors"
        >
          <Plus className="w-4 h-4" /> Add current config
        </button>
        {items.length > 0 && (
          <button
            onClick={() => batchMutation.mutate()}
            disabled={batchMutation.isPending}
            className="min-h-[44px] flex items-center gap-2 px-4 py-2 text-sm rounded-lg btn-primary-mix text-gray-900 dark:text-white font-medium disabled:opacity-50 transition-colors"
          >
            {batchMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Generate All ({items.length})
          </button>
        )}
      </div>
    </div>
  );
}
