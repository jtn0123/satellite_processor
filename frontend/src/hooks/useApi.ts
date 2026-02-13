import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';

// Images
export function useImages() {
  return useQuery({
    queryKey: ['images'],
    queryFn: () => api.get('/images').then((r) => r.data.items ?? r.data),
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

// Jobs
export function useJobs() {
  return useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.get('/jobs').then((r) => r.data.items ?? r.data),
    refetchInterval: 5000,
    staleTime: 3_000,
    gcTime: 60_000,
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: () => api.get(`/jobs/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => api.post('/jobs', params),
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

// System
export function useSystemStatus() {
  return useQuery({
    queryKey: ['system'],
    queryFn: () => api.get('/system/status').then((r) => r.data),
    refetchInterval: 5000,
  });
}

// Settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Record<string, unknown>) => api.put('/settings', settings),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

// Presets
export function usePresets() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => api.get('/presets').then((r) => r.data),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function useCreatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; params: Record<string, unknown> }) =>
      api.post('/presets', data),
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
      api.patch(`/presets/${oldName}`, { name: newName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['presets'] }),
  });
}

// Stats
export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/stats').then((r) => r.data),
    refetchInterval: 10_000,
  });
}

// Health detailed
export function useHealthDetailed() {
  return useQuery({
    queryKey: ['health-detailed'],
    queryFn: () => api.get('/health/detailed').then((r) => r.data),
    refetchInterval: 15_000,
  });
}
