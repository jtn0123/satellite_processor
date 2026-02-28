import CdnImage from './CdnImage';
import CompareSlider from './CompareSlider';
import ShimmerLoader from './ShimmerLoader';
import { timeAgo } from './liveTabUtils';

export interface ImagePanelContentProps {
  isLoading: boolean;
  isError: boolean;
  imageUrl: string | null;
  compareMode: boolean;
  satellite: string;
  band: string;
  sector: string;
  zoomStyle: React.CSSProperties;
  prevImageUrl: string | null;
  comparePosition: number;
  onPositionChange: (pos: number) => void;
  frameTime: string | null;
  prevFrameTime: string | null;
  isZoomed?: boolean;
}

export default function ImagePanelContent({ isLoading, isError, imageUrl, compareMode, satellite, band, sector, zoomStyle, prevImageUrl, comparePosition, onPositionChange, frameTime, prevFrameTime, isZoomed = false }: Readonly<ImagePanelContentProps>) {
  if (isLoading || (!imageUrl && !isError)) {
    return (
      <div className="w-full h-full flex items-center justify-center" data-testid="loading-shimmer">
        <ShimmerLoader />
      </div>
    );
  }
  if (isError && !imageUrl) {
    return (
      <div className="relative w-full h-full flex items-center justify-center" data-testid="live-error-state">
        <ShimmerLoader />
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <span className="text-xs text-white/60 font-medium">Image unavailable · Retrying…</span>
        </div>
      </div>
    );
  }
  if (compareMode) {
    return (
      <CompareSlider
        imageUrl={imageUrl ?? ''}
        prevImageUrl={prevImageUrl}
        comparePosition={comparePosition}
        onPositionChange={onPositionChange}
        frameTime={frameTime}
        prevFrameTime={prevFrameTime}
        timeAgo={timeAgo}
      />
    );
  }
  return (
    <CdnImage
      src={imageUrl ?? ''}
      alt={`${satellite} ${band} ${sector}`}
      className="max-w-full max-h-full select-none"
      style={zoomStyle}
      draggable={false}
      isZoomed={isZoomed}
      data-satellite={satellite}
      data-band={band}
      data-sector={sector}
    />
  );
}
