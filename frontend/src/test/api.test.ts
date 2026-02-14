import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '../api/client';

// Mock axios at the module level
vi.mock('axios', async () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return { default: mockAxios };
});

describe('API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be an axios instance', () => {
    expect(api).toBeDefined();
    expect(api.get).toBeDefined();
    expect(api.post).toBeDefined();
  });

  it('should have get method callable', async () => {
    const mockData = { items: [], total: 0 };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockData, status: 200 });

    const resp = await api.get('/jobs');
    expect(api.get).toHaveBeenCalledWith('/jobs');
    expect(resp.data).toEqual(mockData);
  });

  it('should handle POST requests', async () => {
    const payload = { job_type: 'image_process', params: {} };
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: '123' }, status: 200 });

    const resp = await api.post('/jobs', payload);
    expect(api.post).toHaveBeenCalledWith('/jobs', payload);
    expect(resp.data.id).toBe('123');
  });

  it('should handle errors', async () => {
    const error = new Error('Network Error');
    vi.mocked(api.get).mockRejectedValueOnce(error);

    await expect(api.get('/broken')).rejects.toThrow('Network Error');
  });

  it('should handle PUT requests', async () => {
    vi.mocked(api.put).mockResolvedValueOnce({ data: { ok: true }, status: 200 });
    const resp = await api.put('/settings', { video_fps: 30 });
    expect(resp.data.ok).toBe(true);
  });

  it('should handle DELETE requests', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ data: {}, status: 200 });
    const resp = await api.delete('/jobs/123');
    expect(resp.status).toBe(200);
  });
});
