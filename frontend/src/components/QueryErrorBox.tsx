import { AlertTriangle, RefreshCw } from 'lucide-react';

interface QueryErrorBoxProps {
  message?: string;
  onRetry?: () => void;
  icon?: React.ElementType;
  compact?: boolean;
}

/**
 * Reusable error state for failed TanStack Query queries.
 * Shows an error message with an optional retry button.
 */
export default function QueryErrorBox({
  message = 'Something went wrong',
  onRetry,
  icon: Icon = AlertTriangle,
  compact = false,
}: Readonly<QueryErrorBoxProps>) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400">
        <Icon className="w-4 h-4 shrink-0" />
        <span>{message}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 underline hover:no-underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-space-800 border border-gray-200 dark:border-space-700/50 rounded-xl p-6 text-center">
      <Icon className="w-8 h-8 text-gray-400 dark:text-slate-500 mx-auto mb-2" />
      <p className="text-sm text-gray-500 dark:text-slate-400 mb-3">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                     bg-gray-100 dark:bg-space-700 hover:bg-gray-200 dark:hover:bg-space-600
                     text-gray-700 dark:text-slate-300 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
