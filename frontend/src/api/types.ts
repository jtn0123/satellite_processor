/**
 * Shared frontend types that mirror the backend API contract.
 *
 * We layer three sources:
 *   1. `generated-types.ts` — auto-generated from the FastAPI OpenAPI spec by
 *      `scripts/generate_api_client.sh`. Re-run that script after backend
 *      schema changes; never edit the generated file by hand.
 *   2. This module — thin re-exports of the generated schemas under friendly
 *      names and hand-written interfaces for shapes that the backend still
 *      serves as free-form dicts (e.g. processing params, AppSettings).
 *   3. Feature-specific types living next to their components.
 *
 * JTN-419 / JTN-390 (PR3): tightened the frontend/API contract so every API
 * hook and form carries concrete types rather than `Record<string, unknown>`
 * — the backend now ships an `APIErrorResponse` envelope in OpenAPI and all
 * the paginated endpoints declare their `items` shape.
 */

import type { components } from './generated-types';

// ── Error envelope ────────────────────────────────────────────────────────

/** JSON error envelope returned by the backend `APIError` handler. */
export type APIErrorResponse = components['schemas']['APIErrorResponse'];

// ── Core domain models ────────────────────────────────────────────────────

export type ImageResponse = components['schemas']['ImageResponse'];
export type JobResponse = components['schemas']['JobResponse'];
export type JobCreate = components['schemas']['JobCreate'];
export type JobUpdate = components['schemas']['JobUpdate'];
export type PresetResponse = components['schemas']['PresetResponse'];
export type PresetSummary = components['schemas']['PresetSummary'];
export type SettingsUpdate = components['schemas']['SettingsUpdate'];

// ── Paginated envelopes ───────────────────────────────────────────────────

/** Pagination envelope used by `GET /api/images`, `GET /api/jobs`, etc. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export type PaginatedImages = Paginated<ImageResponse>;
export type PaginatedJobs = Paginated<JobResponse>;

// ── Processing parameters ─────────────────────────────────────────────────

/**
 * Processing job parameters. Mirrors ``ALLOWED_PARAM_KEYS`` in
 * ``backend/app/models/job.py``. The backend accepts a free-form dict, but
 * we constrain the frontend to the known keys so typos (e.g. ``fp`` instead
 * of ``fps``) fail at compile time rather than being silently dropped on
 * the floor by the backend validator.
 */
export interface CropParams {
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type FalseColorMethod = 'vegetation' | 'fire' | 'water_vapor' | 'dust' | 'airmass';

export interface FalseColorParams {
  enabled: boolean;
  method: FalseColorMethod;
}

export type TimestampPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface TimestampParams {
  enabled: boolean;
  position: TimestampPosition;
}

export interface ScaleParams {
  enabled: boolean;
  factor: number;
}

export type VideoCodec = 'h264' | 'hevc' | 'av1';
export type VideoInterpolation = 'none' | 'blend' | 'mci';

export interface VideoParams {
  fps: number;
  codec: VideoCodec;
  quality: number;
  interpolation: VideoInterpolation;
}

/**
 * Complete processing parameter bundle as sent to ``POST /api/jobs`` via
 * ``params``. Every field is optional because the backend fills in defaults
 * and ``ProcessingForm`` only serializes the sub-sections that are enabled.
 */
export interface ProcessingParams {
  image_ids?: string[];
  image_paths?: string[];
  input_path?: string;
  output_path?: string;
  crop?: CropParams | null;
  false_color?: FalseColorParams | null;
  timestamp?: TimestampParams | null;
  scale?: ScaleParams | null;
  video?: VideoParams | null;
  format?: string;
  resolution?: string;
}

// ── Presets ───────────────────────────────────────────────────────────────

/** Stored processing preset. ``params`` is a ProcessingParams bundle. */
export interface Preset {
  id: string;
  name: string;
  params: ProcessingParams;
  created_at: string;
}

export interface PresetCreatePayload {
  name: string;
  params: ProcessingParams;
}

// ── App settings ──────────────────────────────────────────────────────────

/**
 * Loose but typed shape of what ``GET /api/settings`` returns. The backend
 * stores each field independently in the AppSetting key/value table, so the
 * response is not modelled by a single Pydantic class — we mirror the
 * expected keys here. Fields are optional because the DB may be missing a
 * row if the user never overrode a default.
 */
export interface AppSettingsResponse {
  default_crop?: { x: number; y: number; w: number; h: number };
  default_false_color?: FalseColorMethod;
  timestamp_enabled?: boolean;
  timestamp_position?: TimestampPosition;
  video_fps?: number;
  video_codec?: VideoCodec;
  video_quality?: number;
  max_frames_per_fetch?: number;
  webhook_url?: string;
  // Catch-all for admin-only settings that don't yet have a strongly typed
  // counterpart. Using `unknown` (not `any`) keeps callers honest.
  [key: string]: unknown;
}
