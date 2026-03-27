interface SkeletonProps {
  variant?: 'card' | 'text' | 'thumbnail';
  count?: number;
  className?: string;
}

function SkeletonItem({
  variant = 'text',
  className = '',
}: Readonly<Omit<SkeletonProps, 'count'>>) {
  switch (variant) {
    case 'card':
      return (
        <div
          className={`card overflow-hidden ${className}`}
        >
          <div className="aspect-video skeleton-shimmer rounded-t" />
          <div className="p-3 space-y-2">
            <div className="h-3 skeleton-shimmer rounded w-3/4" />
            <div className="h-3 skeleton-shimmer rounded w-1/2" />
          </div>
        </div>
      );
    case 'thumbnail':
      return (
        <div
          className={`aspect-video skeleton-shimmer rounded ${className}`}
        />
      );
    case 'text':
    default:
      return (
        <div
          className={`h-4 skeleton-shimmer rounded w-3/4 ${className}`}
        />
      );
  }
}

export default function Skeleton({
  variant = 'text',
  count = 1,
  className = '',
}: Readonly<SkeletonProps>) {
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
