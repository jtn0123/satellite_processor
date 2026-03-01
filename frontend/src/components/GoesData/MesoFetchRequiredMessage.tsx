import { RefreshCw } from 'lucide-react';

/** Message shown for mesoscale sectors where CDN images are not available */
export default function MesoFetchRequiredMessage({ onFetchNow, isFetching, fetchFailed, errorMessage }: Readonly<{
  onFetchNow: () => void;
  isFetching: boolean;
  fetchFailed: boolean;
  errorMessage: string | null;
}>) {
  if (isFetching) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center p-8" data-testid="meso-fetch-loading">
        <RefreshCw className="w-6 h-6 text-white/70 animate-spin" />
        <p className="text-white/70 text-sm">Fetching mesoscale data from S3…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 text-center p-8" data-testid="meso-fetch-required">
      <p className="text-white/70 text-sm">No live preview available for mesoscale sectors — CDN images are not provided by NOAA.</p>
      {fetchFailed && (
        <p className="text-red-400 text-xs" data-testid="meso-fetch-error">
          {errorMessage || 'No mesoscale data found — try fetching again'}
        </p>
      )}
      <button
        type="button"
        onClick={onFetchNow}
        className="px-4 py-2 rounded-lg bg-primary/80 hover:bg-primary text-white text-sm font-medium transition-colors"
      >
        Fetch to view
      </button>
    </div>
  );
}
