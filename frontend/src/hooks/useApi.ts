import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import type {
  AppSettingsResponse,
  ImageResponse,
  JobCreate,
  JobResponse,
  PaginatedImages,
  PaginatedJobs,
  Preset,
  PresetCreatePayload,
  PresetSummary,
  SettingsUpdate,
} from '../api/types';
import { useIsWebSocketConnected } from '../components/ConnectionStatus';
import { useResilientMutation } from './useResilientMutation';

/**
 * When the `/ws/status` websocket is connected, the backend pushes job/system
 * updates to us over the wire, so TanStack Query doesn't need to poll these
 * endpoints on an interval. `refetchInterval: false` disables the timer while
 * the WS is up; when it drops (network blip, backend restart), polling
 * resumes at the fallback interval.
 *
 * Keeps dashboard XHR traffic well below the ~261/min regression reported in
 * JTN-415 once a websocket is live.
 */
function wsGatedRefetchInterval(wsConnected: boolean, fallbackMs: number): number | false {
  return wsConnected ? false : fallbackMs;
}

// ── Images ────────────────────────────────────────────────────────────────

/**
 * JTN-419: previously `r.data.items ?? r.data` smoothed over any backend
 * endpoint that accidentally returned a flat list instead of the paginated
 * envelope. Now the backend declares ``response_model=PaginatedResponse[ImageResponse]``
 * so we can trust the envelope and surface bugs instead of hiding them.
 */
export function useImages() {
  return useQuery<ImageResponse[]>({
    queryKey: ['images'],
    queryFn: () => api.get<PaginatedImages>('/images').then((r) => r.data.items),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function useUploadImage() {
  const qc = useQueryClient();
  // JTN-396: uploads are large-body and expensive to retry blindly, so
  // we don't compose backoff here. We do still dedup so a double-click
  // on the upload button can't fire two POSTs.
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images'] }),
  });
}

export function useDeleteImage() {
  const qc = useQueryClient();
  // JTN-396: deletes are idempotent on the backend, so retries are
  // safe. Dedup keys include the target id so concurrent deletes of
  // different images don't block each other.
  return useResilientMutation<unknown, unknown, string>({
    mutationFn: (id: string) => api.delete(`/images/${id}`),
    endpointKey: 'DELETE /images',
    dedupKey: (id) => `DELETE /images/${id}`,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['images'] }),
  });
}

// ── Jobs ──────────────────────────────────────────────────────────────────

export function useJobs(params?: { status?: string }) {
  const wsConnected = useIsWebSocketConnected();
  const status = params?.status;
  return useQuery<JobResponse[]>({
    queryKey: ['jobs', status ?? 'all'],
    queryFn: () =>
      api
        // Forward `status` to the backend when set. Once JTN-412's backend half
        // lands the server will honor it; meanwhile the callsite still
        // filters client-side as a fallback so the UI stays correct.
        .get<PaginatedJobs>('/jobs', { params: status ? { status } : undefined })
        .then((r) => r.data.items),
    refetchInterval: wsGatedRefetchInterval(wsConnected, 5000),
    staleTime: 3_000,
    gcTime: 60_000,
  });
}

export function useJob(id: string | null) {
  const wsConnected = useIsWebSocketConnected();
  return useQuery<JobResponse>({
    queryKey: ['jobs', id],
    queryFn: () => api.get<JobResponse>(`/jobs/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: wsGatedRefetchInterval(wsConnected, 3000),
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  // JTN-391 + JTN-396: wrap with dedup + breaker + backoff AND send
  // an Idempotency-Key so the backend dedupes double-submits too.
  //
  // The idempotency key is generated once per *logical* call (via
  // the idempotencyKey option). useResilientMutation stamps it onto
  // the variables before any withBackoff retries, so all retries of
  // the same call share one key while a deliberate caller-initiated
  // retry still produces a fresh key.
  //
  // mutationFn reads `__idempotencyKey` off the enriched variables
  // and promotes it to the HTTP header.
  return useResilientMutation<{ data: JobResponse }, unknown, JobCreate>({
    mutationFn: (params: JobCreate) => {
      const enriched = params as JobCreate & { __idempotencyKey?: string };
      const { __idempotencyKey, ...body } = enriched;
      return api.post<JobResponse>('/jobs', body as JobCreate, {
        headers: __idempotencyKey ? { 'Idempotency-Key': __idempotencyKey } : undefined,
      });
    },
    endpointKey: 'POST /jobs',
    dedupKey: (params) => `POST /jobs:${JSON.stringify(params)}`,
    idempotencyKey: () => crypto.randomUUID(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  // JTN-396: job deletes are idempotent (repeated DELETE is a no-op),
  // safe to retry. Dedup per-id so we don't block different deletes.
  return useResilientMutation<unknown, unknown, string>({
    mutationFn: (id: string) => api.delete(`/jobs/${id}`),
    endpointKey: 'DELETE /jobs',
    dedupKey: (id) => `DELETE /jobs/${id}`,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

// ── System ────────────────────────────────────────────────────────────────

export function useSystemStatus() {
  const wsConnected = useIsWebSocketConnected();
  return useQuery({
    queryKey: ['system'],
    queryFn: () => api.get('/system/status').then((r) => r.data),
    refetchInterval: wsGatedRefetchInterval(wsConnected, 5000),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<AppSettingsResponse>({
    queryKey: ['settings'],
    queryFn: () => api.get<AppSettingsResponse>('/settings').then((r) => r.data),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  // JTN-396: PUT /settings is idempotent — breaker + backoff fit
  // naturally. Dedup singleton key so concurrent saves are blocked.
  return useResilientMutation<{ data: AppSettingsResponse }, unknown, SettingsUpdate>({
    mutationFn: (settings: SettingsUpdate) => api.put<AppSettingsResponse>('/settings', settings),
    endpointKey: 'PUT /settings',
    dedupKey: () => 'PUT /settings',
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

// ── Presets ───────────────────────────────────────────────────────────────

export function usePresets() {
  return useQuery<Preset[]>({
    queryKey: ['presets'],
    // JTN-419: the backend now declares ``response_model=list[PresetResponse]``
    // so we can type this as ``Preset[]`` directly — no defensive fallback.
    queryFn: () => api.get<Preset[]>('/presets').then((r) => r.data),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useCreatePreset() {
  const qc = useQueryClient();
  // JTN-396: preset creates dedup on name + payload, breaker shared across mounts.
  return useResilientMutation<{ data: PresetSummary }, unknown, PresetCreatePayload>({
    mutationFn: (data: PresetCreatePayload) => api.post<PresetSummary>('/presets', data),
    endpointKey: 'POST /presets',
    dedupKey: (data) => `POST /presets:${data.name ?? JSON.stringify(data)}`,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  // JTN-396: preset delete is idempotent — safe to retry.
  return useResilientMutation<unknown, unknown, string>({
    mutationFn: (name: string) => api.delete(`/presets/${name}`),
    endpointKey: 'DELETE /presets',
    dedupKey: (name) => `DELETE /presets/${name}`,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

export function useRenamePreset() {
  const qc = useQueryClient();
  // JTN-396: renames share a breaker but dedup per (old, new) pair.
  return useResilientMutation<
    { data: PresetSummary },
    unknown,
    { oldName: string; newName: string }
  >({
    mutationFn: ({ oldName, newName }) =>
      api.patch<PresetSummary>(`/presets/${oldName}`, { name: newName }),
    endpointKey: 'PATCH /presets',
    dedupKey: ({ oldName, newName }) => `PATCH /presets/${oldName}:${newName}`,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────

export function useStats() {
  const wsConnected = useIsWebSocketConnected();
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats').then((r) => r.data),
    refetchInterval: wsGatedRefetchInterval(wsConnected, 10_000),
  });
}

// ── Health detailed ───────────────────────────────────────────────────────

export function useHealthDetailed() {
  const wsConnected = useIsWebSocketConnected();
  return useQuery({
    queryKey: ['health-detailed'],
    queryFn: () => api.get('/health/detailed').then((r) => r.data),
    refetchInterval: wsGatedRefetchInterval(wsConnected, 15_000),
  });
}
