interface SkeletonProps {
  variant?: 'card' | 'text' | 'thumbnail';
  count?: number;
  className?: string;
}

function SkeletonItem({ variant = 'text', className = '' }: Readonly<Omit<SkeletonProps, 'count'>>) {
  switch (variant) {
    case 'card':
      return (
        <div className={`bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden ${className}`}>
          <div className="aspect-video animate-pulse bg-gray-200 dark:bg-slate-700 rounded-t" />
          <div className="p-3 space-y-2">
            <div className="h-3 animate-pulse bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
            <div className="h-3 animate-pulse bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
          </div>
        </div>
      );
    case 'thumbnail':
      return (
        <div className={`aspect-video animate-pulse bg-gray-200 dark:bg-slate-700 rounded ${className}`} />
      );
    case 'text':
    default:
      return (
        <div className={`h-4 animate-pulse bg-gray-200 dark:bg-slate-700 rounded w-3/4 ${className}`} />
      );
  }
}

export default function Skeleton({ variant = 'text', count = 1, className = '' }: Readonly<SkeletonProps>) {
  if (count === 1) {
    return <SkeletonItem variant={variant} className={className} />;
  }
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => `skel-${variant}-${i}`).map((key) => (
        <SkeletonItem key={key} variant={variant} className={className} />
      ))}
    </div>
  );
}
