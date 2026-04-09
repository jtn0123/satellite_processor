import type { ImgHTMLAttributes, Ref } from 'react';

/**
 * JTN-394: Reusable <Image> wrapper that defaults to lazy loading and
 * async decoding for every image surface in the app. This ensures large
 * image grids (CompositesTab history, ImageGallery thumbnails, frame
 * galleries) never block the main thread on decode and never fetch
 * images that are still offscreen.
 *
 * API mirrors the native <img> element plus two optional responsive
 * helpers — `srcSet` and `sizes`. When the backend gains real responsive
 * variants (see follow-up issue referenced in the PR body) callers can
 * opt in by passing those props; today the wrapper is backend-agnostic.
 *
 * Defaults:
 *   - loading="lazy"        — browser defers offscreen fetches
 *   - decoding="async"      — decode work happens off the main thread
 *   - draggable={false}     — prevents accidental drag-to-download on
 *                             interactive image surfaces
 *
 * Callers that genuinely need eager loading (above-the-fold hero image,
 * lightbox that is the current focus of the user, Compare slider whose
 * current frame must be visible immediately) can pass `loading="eager"`
 * to override. CdnImage keeps its own eager loading because it owns
 * shimmer/retry state and is always the focused Live image.
 */
export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt'> {
  /**
   * Alt text is required to keep the wrapper accessible by default.
   * Use `alt=""` explicitly for purely decorative images.
   */
  readonly alt: string;
  /** Optional forwarded ref — some consumers need imperative access. */
  readonly imageRef?: Ref<HTMLImageElement>;
}

export default function Image({
  alt,
  loading = 'lazy',
  decoding = 'async',
  draggable = false,
  imageRef,
  ...rest
}: ImageProps) {
  return (
    <img
      ref={imageRef}
      alt={alt}
      loading={loading}
      decoding={decoding}
      draggable={draggable}
      {...rest}
    />
  );
}
