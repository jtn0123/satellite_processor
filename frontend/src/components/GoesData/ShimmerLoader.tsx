/**
 * Shimmer/skeleton loading animation for image containers.
 * Shows a gradient sweep animation until the image loads.
 */
export default function ShimmerLoader() {
  return (
    <div
      className="absolute inset-0 z-10 overflow-hidden rounded-lg"
      data-testid="shimmer-loader"
    >
      <div className="w-full h-full bg-slate-800 relative">
        <div
          className="absolute inset-0 animate-shimmer"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );
}
