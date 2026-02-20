import { useState, useRef, useEffect } from 'react';
import { reportError } from '../../utils/errorReporter';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
}

/**
 * Lazy-loaded image using Intersection Observer.
 * Only loads the image when it enters the viewport.
 */
export default function LazyImage({ src, alt, className, placeholder }: Readonly<LazyImageProps>) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let disconnected = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !disconnected) {
          setIsVisible(true);
          disconnected = true;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => {
      disconnected = true;
      observer.disconnect();
    };
  }, []);

  const renderContent = () => {
    if (hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 text-xs">
          Failed to load
        </div>
      );
    }
    if (isVisible) {
      return (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            setHasError(true);
            reportError(new Error(`Image failed to load: ${src}`), 'LazyImage');
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      );
    }
    return placeholder ?? <div className="w-full h-full animate-pulse bg-gray-200 dark:bg-slate-700" />;
  };

  return (
    <div ref={ref} className={className} data-testid="lazy-image-wrapper">
      {renderContent()}
    </div>
  );
}
