/**
 * JTN-387: Extract the image-display branch logic from LiveImageArea.
 *
 * Decides which panel to render for the live viewer:
 *   - HimawariEmptyState when the satellite is Himawari and no CDN image
 *   - A "composite-only" hint for GEOCOLOR meso sectors
 *   - MesoFetchRequiredMessage for other missing-CDN cases
 *   - ImagePanelContent otherwise (which also handles compareMode
 *     and the comparison slider internally)
 *
 * This keeps LiveImageArea under the 250-LOC target without changing
 * any observable behavior.
 */
import type { CSSProperties, RefObject } from 'react';
import type { LatestFrame, Product } from '../types';
import { isHimawariSatellite } from '../../../utils/sectorHelpers';
import ImagePanelContent from '../ImagePanelContent';
import MesoFetchRequiredMessage from '../MesoFetchRequiredMessage';
import HimawariEmptyState from './HimawariEmptyState';

/**
 * Minimal zoom shape ImageContent actually reads from. We intentionally
 * don't rely on ReturnType<typeof useImageZoom> here because LiveImageArea
 * narrows the prop shape (see its local zoom type) — matching that shape
 * keeps the two files compatible without leaking the full hook surface.
 */
interface ZoomStyleOnly {
  readonly style: CSSProperties;
}

interface ImageContentProps {
  readonly imageUrl: string | null;
  readonly catalogImageUrl: string | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isComposite: boolean;
  readonly satellite: string;
  readonly sector: string;
  readonly band: string;
  readonly products: Product | undefined;
  readonly activeJobId: string | null;
  readonly activeJob: {
    id: string;
    status: string;
    progress: number;
    status_message: string;
  } | null;
  readonly lastFetchFailed: boolean;
  readonly fetchNow: () => void;
  readonly compareMode: boolean;
  readonly prevImageUrl: string | null;
  readonly comparePosition: number;
  readonly setComparePosition: (v: number) => void;
  readonly frame: LatestFrame | null | undefined;
  readonly prevFrame: LatestFrame | null | undefined;
  readonly zoom: ZoomStyleOnly;
  readonly imageRef: RefObject<HTMLImageElement | null>;
}

export function ImageContent(props: ImageContentProps) {
  const {
    imageUrl,
    catalogImageUrl,
    isLoading,
    isError,
    isComposite,
    satellite,
    sector,
    band,
    products,
    activeJobId,
    activeJob,
    lastFetchFailed,
    fetchNow,
    compareMode,
    prevImageUrl,
    comparePosition,
    setComparePosition,
    frame,
    prevFrame,
    zoom,
    imageRef,
  } = props;
  const isHimawari = isHimawariSatellite(satellite);
  const isCdnUnavailable =
    !imageUrl &&
    (products?.sectors?.find((s) => s.id === sector)?.cdn_available === false || isHimawari) &&
    !isLoading;
  if (isCdnUnavailable && isHimawari) {
    return (
      <HimawariEmptyState
        satellite={satellite}
        sector={sector}
        band={band}
        activeJobId={activeJobId}
        fetchNow={fetchNow}
      />
    );
  }
  if (isCdnUnavailable && isComposite) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-4 text-center p-8"
        data-testid="geocolor-meso-message"
      >
        <p className="text-white/70 text-sm">
          GEOCOLOR is only available via CDN for CONUS and Full Disk sectors. Select a different
          band to fetch mesoscale data.
        </p>
      </div>
    );
  }
  if (isCdnUnavailable) {
    return (
      <MesoFetchRequiredMessage
        onFetchNow={fetchNow}
        isFetching={!!activeJobId}
        fetchFailed={lastFetchFailed}
        errorMessage={activeJob?.status === 'failed' ? activeJob.status_message : null}
      />
    );
  }
  return (
    <ImagePanelContent
      isLoading={isLoading && !catalogImageUrl}
      isError={isError && !imageUrl}
      imageUrl={imageUrl}
      compareMode={compareMode}
      satellite={satellite}
      band={band}
      sector={sector}
      zoomStyle={zoom.style}
      prevImageUrl={prevImageUrl}
      comparePosition={comparePosition}
      onPositionChange={setComparePosition}
      frameTime={frame?.capture_time ?? null}
      prevFrameTime={prevFrame?.capture_time ?? null}
      imageRef={imageRef}
    />
  );
}
