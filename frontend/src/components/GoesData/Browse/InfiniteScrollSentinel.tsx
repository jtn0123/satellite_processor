import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const InfiniteScrollSentinel = forwardRef<
  HTMLDivElement,
  Readonly<{
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
  }>
>(function InfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage }, ref) {
  if (!hasNextPage) return null;

  return (
    <div ref={ref} className="flex justify-center py-6">
      {isFetchingNextPage ? (
        <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-slate-500" />
      ) : (
        <button
          type="button"
          onClick={() => fetchNextPage()}
          className="px-6 py-3 text-sm font-medium text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 rounded-xl hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors min-h-[44px]"
        >
          Load More
        </button>
      )}
    </div>
  );
});

export default InfiniteScrollSentinel;
