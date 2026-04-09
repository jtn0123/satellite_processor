import type { LatestFrame, CatalogLatest } from '../types';
import { extractArray } from '../../../utils/safeData';
import { timeAgo } from '../liveTabUtils';
import { buildCdnUrl, isHimawariSatellite } from '../../../utils/sectorHelpers';

export function getAutoFetchDisabledReason(satellite: string, isMeso: boolean): string {
  if (isHimawariSatellite(satellite)) return 'Auto-fetch not yet available for Himawari';
  if (isMeso) return 'Auto-fetch not available for mesoscale sectors';
  return 'Auto-fetch not available for GeoColor — CDN images update automatically';
}

/** Resolve image URLs from local frames and catalog, with responsive mobile fallback */
export function resolveImageUrls(
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
  recentFrames: LatestFrame[] | undefined,
  satellite?: string,
  sector?: string,
  band?: string,
  isMobileView?: boolean,
) {
  const catalogImageUrl =
    (isMobileView ? catalogLatest?.mobile_url : catalogLatest?.image_url) ??
    catalogLatest?.image_url ??
    null;
  const localImageUrl = frame?.thumbnail_url ?? frame?.image_url ?? null;
  const directCdnUrl = buildCdnUrl(satellite ?? '', sector ?? '', band ?? '', isMobileView);
  const imageUrl = localImageUrl ?? catalogImageUrl ?? directCdnUrl;

  const recentFramesList = extractArray<LatestFrame>(recentFrames);
  const prevFrame = recentFramesList?.[1];
  const prevImageUrl = prevFrame?.thumbnail_url ?? prevFrame?.image_url ?? null;

  return { catalogImageUrl, localImageUrl, imageUrl, prevFrame, prevImageUrl };
}

export function computeFreshness(
  catalogLatest: CatalogLatest | null | undefined,
  frame: LatestFrame | null | undefined,
) {
  if (!catalogLatest || !frame) return null;
  const awsAge = timeAgo(catalogLatest.scan_time);
  const localAge = timeAgo(frame.capture_time);
  const awsMs = Date.now() - new Date(catalogLatest.scan_time).getTime();
  const localMs = Date.now() - new Date(frame.capture_time).getTime();
  const behind = localMs - awsMs;
  const behindMin = Math.floor(behind / 60000);
  return { awsAge, localAge, behindMin };
}

export async function exitFullscreenSafe() {
  try {
    await document.exitFullscreen();
  } catch {
    await (
      document as unknown as { webkitExitFullscreen?: () => Promise<void> }
    ).webkitExitFullscreen?.();
  }
}

export async function enterFullscreenSafe(el: HTMLElement) {
  try {
    await el.requestFullscreen();
  } catch {
    await (
      el as unknown as { webkitRequestFullscreen?: () => Promise<void> }
    ).webkitRequestFullscreen?.();
  }
}

export function buildOuterClassName(isZoomed: boolean): string {
  const mobileHeight = isZoomed ? 'max-md:h-[100dvh]' : 'max-md:h-[calc(100dvh-112px)]';
  return `relative md:h-[calc(100dvh-4rem)] ${mobileHeight} flex flex-col bg-black max-md:-mx-4 max-md:px-0`;
}
