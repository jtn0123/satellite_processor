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
  return useMutation({
    mutationFn: (id: string) => api.delete(`/images/${id}`),
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
  return useMutation({
    // JTN-391: generate a fresh Idempotency-Key per submission so that
    // accidental double-submits (double-click, TanStack mutation replay
    // after a reconnect) dedupe server-side without creating a second
    // Job row. The key is new per mutation call, so a deliberate
    // retry-with-changes still produces a distinct job.
    mutationFn: (params: JobCreate) =>
      api.post<JobResponse>('/jobs', params, {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/jobs/${id}`),
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
  return useMutation({
    mutationFn: (settings: SettingsUpdate) => api.put<AppSettingsResponse>('/settings', settings),
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
  return useMutation({
    mutationFn: (data: PresetCreatePayload) => api.post<PresetSummary>('/presets', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

export function useDeletePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.delete(`/presets/${name}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

export function useRenamePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ oldName, newName }: { oldName: string; newName: string }) =>
      api.patch<PresetSummary>(`/presets/${oldName}`, { name: newName }),
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
