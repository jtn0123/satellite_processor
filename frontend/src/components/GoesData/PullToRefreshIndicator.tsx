import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold?: number;
}

export default function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: Readonly<PullToRefreshIndicatorProps>) {
  if (pullDistance <= 0 && !isRefreshing) {
    return null;
  }

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = progress * 360;

  return (
    <div
      className="flex justify-center overflow-hidden transition-all"
      style={{ height: isRefreshing ? 40 : Math.max(pullDistance * 0.5, 0) }}
    >
      <div className="flex items-center justify-center">
        <RefreshCw
          className={`w-5 h-5 text-primary ${isRefreshing ? 'animate-spin' : ''}`}
          style={isRefreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
        />
        {isRefreshing && (
          <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">Refreshing...</span>
        )}
      </div>
    </div>
  );
}
