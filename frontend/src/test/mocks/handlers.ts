/**
 * Mock Service Worker handlers for frontend tests.
 *
 * These handlers intercept HTTP calls made by the axios `api` client during
 * vitest runs. They provide sensible empty/default payloads for the
 * most-used endpoints so component tests can render without needing to
 * stub every axios method manually.
 *
 * Test files can compose on top of these with `server.use(...)` to layer
 * endpoint-specific responses (see `msw` docs for request-level overrides).
 *
 * Where possible, response shapes are typed from `generated-types.ts`
 * (re-exported via `../../api/types.ts`) so handler payloads stay in
 * lockstep with the backend OpenAPI contract — a regression in the
 * backend schema surfaces here as a type error rather than a silent test
 * failure.
 */
import { http, HttpResponse } from 'msw';
import type { components } from '../../api/generated-types';
import type { Paginated } from '../../api/types';

type GoesFrameResponse = components['schemas']['GoesFrameResponse'];
type FrameStatsResponse = components['schemas']['FrameStatsResponse'];
type JobResponse = components['schemas']['JobResponse'];
type PresetResponse = components['schemas']['PresetResponse'];

const API = '*/api';

// ── Empty payload factories ─────────────────────────────────────────────
// Exported so individual tests can build on them with server.use().

export function emptyPaginatedFrames(): Paginated<GoesFrameResponse> {
  return { items: [], total: 0, page: 1, limit: 50 };
}

export function emptyFrameStats(): FrameStatsResponse {
  return {
    total_frames: 0,
    total_size_bytes: 0,
    by_satellite: {},
    by_band: {},
  };
}

export function emptyProducts() {
  return { satellites: [], bands: [], sectors: [] };
}

export function emptyCleanupStats() {
  return {
    total_frames: 0,
    total_size_bytes: 0,
    oldest_frame: null,
    newest_frame: null,
  };
}

export function emptyPaginatedJobs(): Paginated<JobResponse> {
  return { items: [], total: 0, page: 1, limit: 50 };
}

// ── Default handlers ────────────────────────────────────────────────────

export const handlers = [
  // Frames & stats
  http.get(`${API}/satellite/frames`, () => HttpResponse.json(emptyPaginatedFrames())),
  http.get(`${API}/satellite/frames/stats`, () => HttpResponse.json(emptyFrameStats())),
  http.get(`${API}/satellite/frames/:id`, ({ params }) =>
    HttpResponse.json({
      id: params.id,
      satellite: 'GOES-16',
      sector: 'CONUS',
      band: 'C02',
      capture_time: '2024-06-01T12:00:00Z',
      file_size: 0,
      width: null,
      height: null,
      image_url: null,
      thumbnail_url: null,
      source_job_id: null,
      created_at: null,
      tags: [],
      collections: [],
    }),
  ),
  http.delete(`${API}/satellite/frames/:id`, () => HttpResponse.json({ ok: true })),

  // Products / catalog
  http.get(`${API}/satellite/products`, () => HttpResponse.json(emptyProducts())),
  http.get(`${API}/satellite/catalog/latest`, () => HttpResponse.json(null)),
  http.get(`${API}/satellite/latest`, () => HttpResponse.json([])),

  // Tags & collections
  http.get(`${API}/satellite/tags`, () => HttpResponse.json([])),
  http.post(`${API}/satellite/tags`, () =>
    HttpResponse.json({ id: 'tag-1', name: 'new', color: '#808080' }),
  ),
  http.get(`${API}/satellite/collections`, () => HttpResponse.json([])),
  http.post(`${API}/satellite/collections`, async ({ request }) => {
    const body = (await request.json()) as { name?: string } | null;
    return HttpResponse.json({ id: 'col-1', name: body?.name ?? 'new', frame_count: 0 });
  }),
  http.put(`${API}/satellite/collections/:id`, async ({ request, params }) => {
    const body = (await request.json()) as { name?: string } | null;
    return HttpResponse.json({ id: params.id, name: body?.name ?? 'renamed', frame_count: 0 });
  }),
  http.delete(`${API}/satellite/collections/:id`, () => HttpResponse.json({ ok: true })),

  // Cleanup
  http.get(`${API}/satellite/cleanup-rules`, () => HttpResponse.json([])),
  http.post(`${API}/satellite/cleanup-rules`, () => HttpResponse.json({ id: 'rule-1' })),
  http.get(`${API}/satellite/cleanup/stats`, () => HttpResponse.json(emptyCleanupStats())),
  http.get(`${API}/satellite/cleanup/preview`, () =>
    HttpResponse.json({ frames_to_delete: 0, bytes_to_free: 0, frames: [] }),
  ),
  http.post(`${API}/satellite/cleanup/run`, () =>
    HttpResponse.json({ deleted: 0, bytes_freed: 0 }),
  ),

  // Fetch presets & schedules
  http.get(`${API}/satellite/fetch-presets`, () => HttpResponse.json([])),
  http.post(`${API}/satellite/fetch-presets`, () => HttpResponse.json({ id: 'p-1' })),
  http.get(`${API}/satellite/schedules`, () => HttpResponse.json([])),
  http.post(`${API}/satellite/schedules`, () => HttpResponse.json({ id: 's-1' })),

  // Gaps / backfill
  http.get(`${API}/satellite/gaps`, () => HttpResponse.json({ gaps: [] })),
  http.post(`${API}/satellite/backfill`, () => HttpResponse.json({ job_id: 'bf-1' })),

  // Fetch jobs
  http.post(`${API}/satellite/fetch`, () =>
    HttpResponse.json({ job_id: 'job-1', status: 'pending' }),
  ),

  // Composites
  http.get(`${API}/satellite/composite-recipes`, () => HttpResponse.json([])),
  http.get(`${API}/satellite/composites`, () =>
    HttpResponse.json({ items: [], total: 0, page: 1, limit: 20 }),
  ),
  http.post(`${API}/satellite/composites`, () => HttpResponse.json({ id: 'c-1' })),
  http.delete(`${API}/satellite/composites/:id`, () => HttpResponse.json({ ok: true })),

  // Animations
  http.get(`${API}/satellite/animations`, () =>
    HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 }),
  ),
  http.post(`${API}/satellite/animations`, () => HttpResponse.json({ id: 'anim-1' })),
  http.get(`${API}/satellite/crop-presets`, () => HttpResponse.json([])),

  // Jobs
  http.get(`${API}/jobs`, () => HttpResponse.json(emptyPaginatedJobs())),
  http.post(`${API}/jobs`, () => HttpResponse.json({ id: 'job-1', status: 'pending' })),
  http.get(`${API}/jobs/:id`, ({ params }) =>
    HttpResponse.json({ id: params.id, status: 'pending', progress: 0, logs: [] }),
  ),
  http.delete(`${API}/jobs/:id`, () => HttpResponse.json({ ok: true })),
  http.post(`${API}/jobs/:id/cancel`, () => HttpResponse.json({ ok: true })),

  // Presets (processing)
  http.get(`${API}/presets`, () => HttpResponse.json([] as PresetResponse[])),
  http.post(`${API}/presets`, () =>
    HttpResponse.json({ id: 'preset-1', name: 'new', params: {}, created_at: '2024-01-01' }),
  ),
  http.delete(`${API}/presets/:id`, () => HttpResponse.json({ ok: true })),

  // Settings
  http.get(`${API}/settings`, () => HttpResponse.json({})),
  http.put(`${API}/settings`, () => HttpResponse.json({})),
  http.post(`${API}/settings`, () => HttpResponse.json({})),

  // Notifications
  http.get(`${API}/notifications`, () => HttpResponse.json([])),
  http.post(`${API}/notifications/:id/read`, () => HttpResponse.json({ ok: true })),
  http.delete(`${API}/notifications/:id`, () => HttpResponse.json({ ok: true })),

  // Health / status / version
  http.get(`${API}/health`, () => HttpResponse.json({ status: 'ok' })),
  http.get(`${API}/status`, () => HttpResponse.json({ status: 'ok' })),
  http.get(`${API}/version`, () => HttpResponse.json({ version: 'test' })),
  http.get(`${API}/system/resources`, () =>
    HttpResponse.json({ cpu_percent: 0, memory_percent: 0, disk_percent: 0 }),
  ),
];
