import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { saveCachedImage, loadCachedImage } from './liveTabUtils';
import type { CachedImageMeta } from './liveTabUtils';

export interface CdnImageProps extends Readonly<React.ImgHTMLAttributes<HTMLImageElement>> {
  'data-satellite'?: string;
  'data-band'?: string;
  'data-sector'?: string;
  isZoomed?: boolean;
}

export default function CdnImage({ src, alt, className, isZoomed = false, ...props }: Readonly<CdnImageProps>) {
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [usingCached, setUsingCached] = useState(false);
  const [cachedMeta, setCachedMeta] = useState<CachedImageMeta | null>(null);
  const [cachedDismissed, setCachedDismissed] = useState(false);
  const [displaySrc, setDisplaySrc] = useState(src);
  // Reset state when src changes — no crossfade to avoid stale band images
  /* eslint-disable react-hooks/set-state-in-effect -- intentional reset on prop change */
  useEffect(() => {
    setError(false);
    setLoaded(false);
    setUsingCached(false);
    setCachedMeta(null);
    setCachedDismissed(false);
    setDisplaySrc(src);
  }, [src]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dataSatellite = props['data-satellite'];
  const dataBand = props['data-band'];
  const dataSector = props['data-sector'];

  const handleLoad = useCallback(() => {
    setLoaded(true);
    // Cache successful load
    if (src && !usingCached) {
      saveCachedImage(src, {
        satellite: dataSatellite ?? '',
        band: dataBand ?? '',
        sector: dataSector ?? '',
        timestamp: new Date().toISOString(),
      });
    }
  }, [src, usingCached, dataSatellite, dataBand, dataSector]);

  const handleError = useCallback(() => {
    // Try cached image before showing error
    if (!usingCached) {
      const cached = loadCachedImage(dataSatellite, dataSector, dataBand);
      if (cached) {
        setUsingCached(true);
        setCachedMeta(cached);
        setDisplaySrc(cached.url);
        setError(false);
        setLoaded(false);
        return;
      }
    }
    setError(true);
  }, [usingCached, dataSatellite, dataBand, dataSector]);

  // Auto-retry on error after 10 seconds
  useEffect(() => {
    if (!error || !src) return;
    const timer = setTimeout(() => {
      setError(false);
      setLoaded(false);
      setUsingCached(false);
      setCachedMeta(null);
      setCachedDismissed(false);
      const separator = src.includes('?') ? '&' : '?';
      setDisplaySrc(`${src}${separator}_r=${Date.now()}`);
    }, 10000);
    return () => clearTimeout(timer);
  }, [error, src]);

  if (error || !displaySrc) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="cdn-image-error">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-lg" />
        <span className="relative z-10 text-xs text-white/60 font-medium">Image unavailable · Retrying…</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900">
      {/* Cached image banner — inline above image, dismissible */}
      {usingCached && cachedMeta && !cachedDismissed && (
        <div className="w-full flex justify-center px-4 py-1" data-testid="cached-image-banner">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-200 text-[11px]">
            <span>Cached image · {new Date(cachedMeta.timestamp).toLocaleString()}</span>
            <button onClick={() => setCachedDismissed(true)} className="p-0.5 hover:bg-white/10 rounded" aria-label="Dismiss cached banner">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
      {/* Shimmer placeholder */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-lg" data-testid="image-shimmer" />
      )}
      <div className={`relative md:rounded-lg overflow-hidden md:border md:border-white/10 w-full bg-slate-900 ${isZoomed ? 'h-full' : 'h-full'}`} data-testid="live-image-container">
        <img
          src={displaySrc}
          alt={alt}
          onError={handleError}
          onLoad={handleLoad}
          loading="eager"
          className={`${className ?? ''} w-full h-full ${isZoomed ? 'object-cover' : 'object-contain'} md:rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          {...props}
        />
      </div>
    </div>
  );
}
