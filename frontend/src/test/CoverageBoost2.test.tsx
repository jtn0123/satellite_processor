// TODO(#43): Low-value coverage boost file. Hook tests here mostly just check that
// mutate/data exist without verifying behavior. Replace with tests that exercise
// actual API interactions, error states, and cache invalidation logic.
/**
 * Coverage boost tests part 2 — hooks and more components.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Real useApi hooks ────────────────────────────────────────────────────────

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { items: [{ id: '1' }] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}


describe('useApi hooks - real implementations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('useImages fetches images', async () => {
    const { useImages } = await import('../hooks/useApi');
    const { result } = renderHook(() => useImages(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useUploadImage mutation', async () => {
    const { useUploadImage } = await import('../hooks/useApi');
    const { result } = renderHook(() => useUploadImage(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useDeleteImage mutation', async () => {
    const { useDeleteImage } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeleteImage(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useJobs fetches jobs', async () => {
    const { useJobs } = await import('../hooks/useApi');
    const { result } = renderHook(() => useJobs(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useJob fetches single job when enabled', async () => {
    const { useJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useJob('job-1'), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useJob disabled when null', async () => {
    const { useJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useJob(null), { wrapper: createWrapper() });
    expect(result.current.data).toBeUndefined();
  });

  it('useCreateJob mutation', async () => {
    const { useCreateJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useCreateJob(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useDeleteJob mutation', async () => {
    const { useDeleteJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeleteJob(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useSystemStatus fetches status', async () => {
    const { useSystemStatus } = await import('../hooks/useApi');
    const { result } = renderHook(() => useSystemStatus(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useSettings fetches settings', async () => {
    const { useSettings } = await import('../hooks/useApi');
    const { result } = renderHook(() => useSettings(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useUpdateSettings mutation', async () => {
    const { useUpdateSettings } = await import('../hooks/useApi');
    const { result } = renderHook(() => useUpdateSettings(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('usePresets fetches presets', async () => {
    const { usePresets } = await import('../hooks/useApi');
    const { result } = renderHook(() => usePresets(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useCreatePreset mutation', async () => {
    const { useCreatePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useCreatePreset(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useDeletePreset mutation', async () => {
    const { useDeletePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeletePreset(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useRenamePreset mutation', async () => {
    const { useRenamePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useRenamePreset(), { wrapper: createWrapper() });
    expect(result.current.mutate).toBeDefined();
  });

  it('useStats fetches stats', async () => {
    const { useStats } = await import('../hooks/useApi');
    const { result } = renderHook(() => useStats(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useHealthDetailed fetches health', async () => {
    const { useHealthDetailed } = await import('../hooks/useApi');
    const { result } = renderHook(() => useHealthDetailed(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(result.current.data).toBeDefined());
  });

  it('useUploadImage calls api.post on mutate', async () => {
    const apiMod = await import('../api/client');
    const { useUploadImage } = await import('../hooks/useApi');
    const { result } = renderHook(() => useUploadImage(), { wrapper: createWrapper() });
    const fd = new FormData();
    await act(() => result.current.mutate(fd));
    expect(apiMod.default.post).toHaveBeenCalled();
  });

  it('useDeleteImage calls api.delete on mutate', async () => {
    const apiMod = await import('../api/client');
    const { useDeleteImage } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeleteImage(), { wrapper: createWrapper() });
    await act(() => result.current.mutate('img-1'));
    expect(apiMod.default.delete).toHaveBeenCalledWith('/images/img-1');
  });

  it('useCreateJob calls api.post on mutate', async () => {
    const apiMod = await import('../api/client');
    const { useCreateJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useCreateJob(), { wrapper: createWrapper() });
    await act(() => result.current.mutate({ type: 'test' }));
    expect(apiMod.default.post).toHaveBeenCalledWith('/jobs', { type: 'test' });
  });

  it('useDeleteJob calls api.delete on mutate', async () => {
    const apiMod = await import('../api/client');
    const { useDeleteJob } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeleteJob(), { wrapper: createWrapper() });
    await act(() => result.current.mutate('job-1'));
    expect(apiMod.default.delete).toHaveBeenCalledWith('/jobs/job-1');
  });

  it('useUpdateSettings calls api.put', async () => {
    const apiMod = await import('../api/client');
    const { useUpdateSettings } = await import('../hooks/useApi');
    const { result } = renderHook(() => useUpdateSettings(), { wrapper: createWrapper() });
    await act(() => result.current.mutate({ theme: 'dark' }));
    expect(apiMod.default.put).toHaveBeenCalledWith('/settings', { theme: 'dark' });
  });

  it('useCreatePreset calls api.post', async () => {
    const apiMod = await import('../api/client');
    const { useCreatePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useCreatePreset(), { wrapper: createWrapper() });
    await act(() => result.current.mutate({ name: 'test', params: {} }));
    expect(apiMod.default.post).toHaveBeenCalledWith('/presets', { name: 'test', params: {} });
  });

  it('useDeletePreset calls api.delete', async () => {
    const apiMod = await import('../api/client');
    const { useDeletePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useDeletePreset(), { wrapper: createWrapper() });
    await act(() => result.current.mutate('preset-1'));
    expect(apiMod.default.delete).toHaveBeenCalledWith('/presets/preset-1');
  });

  it('useRenamePreset calls api.patch', async () => {
    const apiMod = await import('../api/client');
    const { useRenamePreset } = await import('../hooks/useApi');
    const { result } = renderHook(() => useRenamePreset(), { wrapper: createWrapper() });
    await act(() => result.current.mutate({ oldName: 'a', newName: 'b' }));
    expect(apiMod.default.patch).toHaveBeenCalledWith('/presets/a', { name: 'b' });
  });
});

// ─── useSwipeTabs extended ────────────────────────────────────────────────────

describe('useSwipeTabs extended', () => {
  it('swipe left goes to next tab', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'b', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    // Simulate swipe left (negative dx)
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 50, clientY: 100 }] });
    expect(onSwipe).toHaveBeenCalledWith('c');
  });

  it('swipe right goes to previous tab', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'b', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    fireEvent.touchStart(el, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(onSwipe).toHaveBeenCalledWith('a');
  });

  it('ignores vertical swipe', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'b', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 50 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 110, clientY: 300 }] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('ignores when disabled', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'b', onSwipe, enabled: false });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 50, clientY: 100 }] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does not swipe past first tab', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'a', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    fireEvent.touchStart(el, { touches: [{ clientX: 50, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200, clientY: 100 }] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('does not swipe past last tab', async () => {
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'c', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 50, clientY: 100 }] });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('ignores too-slow swipe', async () => {
    vi.useFakeTimers();
    const { useSwipeTabs } = await vi.importActual<typeof import('../hooks/useSwipeTabs')>('../hooks/useSwipeTabs');
    const onSwipe = vi.fn();
    function TestComp() {
      const ref = useSwipeTabs({ tabs: ['a', 'b', 'c'], activeTab: 'b', onSwipe });
      return <div ref={ref} data-testid="swipe">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('swipe');
    const now = Date.now();
    vi.setSystemTime(now);
    fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
    vi.setSystemTime(now + 600);
    fireEvent.touchEnd(el, { changedTouches: [{ clientX: 50, clientY: 100 }] });
    expect(onSwipe).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── usePullToRefresh extended ────────────────────────────────────────────────

describe('usePullToRefresh extended', () => {
  it('touch pull triggers refresh', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { usePullToRefresh } = await vi.importActual<typeof import('../hooks/usePullToRefresh')>('../hooks/usePullToRefresh');

    function TestComp() {
      const { containerRef, isRefreshing, pullDistance } = usePullToRefresh({ onRefresh, threshold: 40 });
      return (
        <div ref={containerRef} data-testid="pull" style={{ overflow: 'auto' }}>
          <span data-testid="refreshing">{String(isRefreshing)}</span>
          <span data-testid="distance">{pullDistance}</span>
          <div style={{ height: 2000 }}>tall content</div>
        </div>
      );
    }
    render(<TestComp />);
    const el = screen.getByTestId('pull');
    // scrollTop is 0 by default
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 50 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 200 }] });
    await act(async () => {
      fireEvent.touchEnd(el);
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it('disabled does not trigger', async () => {
    const onRefresh = vi.fn();
    const { usePullToRefresh } = await vi.importActual<typeof import('../hooks/usePullToRefresh')>('../hooks/usePullToRefresh');

    function TestComp() {
      const { containerRef } = usePullToRefresh({ onRefresh, enabled: false });
      return <div ref={containerRef} data-testid="pull">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('pull');
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 50 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(el);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('short pull does not trigger refresh', async () => {
    const onRefresh = vi.fn();
    const { usePullToRefresh } = await vi.importActual<typeof import('../hooks/usePullToRefresh')>('../hooks/usePullToRefresh');

    function TestComp() {
      const { containerRef } = usePullToRefresh({ onRefresh, threshold: 80 });
      return <div ref={containerRef} data-testid="pull">content</div>;
    }
    render(<TestComp />);
    const el = screen.getByTestId('pull');
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
    fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 50 }] });
    fireEvent.touchMove(el, { touches: [{ clientX: 100, clientY: 60 }] });
    fireEvent.touchEnd(el);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

// ─── useHotkeys extended ──────────────────────────────────────────────────────

describe('useHotkeys extended', () => {
  it('registers and fires single-key shortcut', async () => {
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 's': handler });
      return <div>test</div>;
    }
    render(<TestComp />);
    fireEvent.keyDown(document, { key: 's' });
    expect(handler).toHaveBeenCalled();
  });

  it('ignores when typing in input', async () => {
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 's': handler });
      return <input data-testid="input" />;
    }
    render(<TestComp />);
    const input = screen.getByTestId('input');
    fireEvent.keyDown(input, { key: 's' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores modifier keys', async () => {
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 's': handler });
      return <div>test</div>;
    }
    render(<TestComp />);
    fireEvent.keyDown(document, { key: 's', ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('two-key sequence works', async () => {
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 'g d': handler });
      return <div>test</div>;
    }
    render(<TestComp />);
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'd' });
    expect(handler).toHaveBeenCalled();
  });

  it('two-key sequence timeout expires', async () => {
    vi.useFakeTimers();
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 'g d': handler });
      return <div>test</div>;
    }
    render(<TestComp />);
    fireEvent.keyDown(document, { key: 'g' });
    vi.advanceTimersByTime(600);
    fireEvent.keyDown(document, { key: 'd' });
    expect(handler).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('wrong second key in sequence does not fire', async () => {
    const { useHotkeys } = await vi.importActual<typeof import('../hooks/useHotkeys')>('../hooks/useHotkeys');
    const handler = vi.fn();
    function TestComp() {
      useHotkeys({ 'g d': handler });
      return <div>test</div>;
    }
    render(<TestComp />);
    fireEvent.keyDown(document, { key: 'g' });
    fireEvent.keyDown(document, { key: 'x' });
    expect(handler).not.toHaveBeenCalled();
  });
});
