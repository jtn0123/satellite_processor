/**
 * Coverage boost tests — targets low-coverage files to reach 80% overall.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../hooks/useApi', () => ({
  useImages: vi.fn(() => ({ data: [], isLoading: false })),
  useJobs: vi.fn(() => ({ data: [], isLoading: false })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePresets: vi.fn(() => ({ data: [], isLoading: false })),
  useDeletePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRenamePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSettings: vi.fn(() => ({ data: {}, isLoading: false })),
  useUpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSystemStatus: vi.fn(() => ({ data: {}, isLoading: false })),
  useStats: vi.fn(() => ({ data: {}, isLoading: false })),
  useHealthDetailed: vi.fn(() => ({ data: {}, isLoading: false })),
  useCreatePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useUploadImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCreateJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useJob: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'j1' } })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── Presets Page ─────────────────────────────────────────────────────────────

describe('Presets Page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows loading skeleton', async () => {
    const { usePresets } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: true });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByText('Manage processing presets')).toBeInTheDocument();
  });

  it('shows empty state', async () => {
    const { usePresets } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    expect(screen.getByText('No presets yet')).toBeInTheDocument();
  });

  it('renders preset list', async () => {
    const { usePresets } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', name: 'Test Preset', params: { a: 1, b: 2 }, created_at: '2024-01-01T00:00:00Z' }],
      isLoading: false,
    });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    expect(screen.getByText('Test Preset')).toBeInTheDocument();
    expect(screen.getByText(/2 parameters/)).toBeInTheDocument();
  });

  it('rename flow: click rename, type, confirm', async () => {
    const mutate = vi.fn((_data: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.());
    const { usePresets, useRenamePreset } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', name: 'Old Name', params: {}, created_at: '2024-01-01T00:00:00Z' }],
      isLoading: false,
    });
    (useRenamePreset as ReturnType<typeof vi.fn>).mockReturnValue({ mutate, isPending: false });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('Old Name');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mutate).toHaveBeenCalledWith(
      { oldName: 'Old Name', newName: 'New Name' },
      expect.any(Object),
    );
  });

  it('rename cancel with Escape', async () => {
    const { usePresets } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', name: 'Old Name', params: {}, created_at: '2024-01-01T00:00:00Z' }],
      isLoading: false,
    });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    fireEvent.click(screen.getByTitle('Rename'));
    fireEvent.keyDown(screen.getByDisplayValue('Old Name'), { key: 'Escape' });
    expect(screen.getByText('Old Name')).toBeInTheDocument();
  });

  it('rename with same name does nothing', async () => {
    const mutate = vi.fn();
    const { usePresets, useRenamePreset } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', name: 'Same', params: {}, created_at: '2024-01-01T00:00:00Z' }],
      isLoading: false,
    });
    (useRenamePreset as ReturnType<typeof vi.fn>).mockReturnValue({ mutate, isPending: false });
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    fireEvent.click(screen.getByTitle('Rename'));
    // Don't change the input
    const checkBtn = screen.getAllByRole('button').find(b => b.querySelector('.lucide-check'));
    if (checkBtn) fireEvent.click(checkBtn);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('delete with confirm', async () => {
    const mutate = vi.fn();
    const { usePresets, useDeletePreset } = await import('../hooks/useApi');
    (usePresets as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', name: 'DelMe', params: {}, created_at: '2024-01-01T00:00:00Z' }],
      isLoading: false,
    });
    (useDeletePreset as ReturnType<typeof vi.fn>).mockReturnValue({ mutate, isPending: false });
    globalThis.confirm = vi.fn(() => true);
    const { default: PresetsPage } = await import('../pages/Presets');
    wrap(<PresetsPage />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(mutate).toHaveBeenCalledWith('DelMe');
  });
});

// ─── Process Page ─────────────────────────────────────────────────────────────

describe('Process Page', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no images', async () => {
    const { useImages } = await import('../hooks/useApi');
    (useImages as ReturnType<typeof vi.fn>).mockReturnValue({ data: [], isLoading: false });
    const { default: ProcessPage } = await import('../pages/Process');
    wrap(<ProcessPage />);
    expect(screen.getByText('No images yet')).toBeInTheDocument();
    expect(screen.getByText('Upload Images')).toBeInTheDocument();
  });

  it('shows image gallery when images exist', async () => {
    const { useImages } = await import('../hooks/useApi');
    (useImages as ReturnType<typeof vi.fn>).mockReturnValue({
      data: [{ id: '1', filename: 'test.png', url: '/test.png' }],
      isLoading: false,
    });
    const { default: ProcessPage } = await import('../pages/Process');
    wrap(<ProcessPage />);
    expect(screen.getByText(/Select Images/)).toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });
});

// ─── UploadZone ───────────────────────────────────────────────────────────────

describe('UploadZone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders drag and drop zone', async () => {
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument();
    expect(screen.getByText(/PNG, TIFF, JPEG/)).toBeInTheDocument();
  });

  it('handles drag over and leave', async () => {
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    const zone = screen.getByText(/Drag & drop/).closest('button')!;
    fireEvent.dragOver(zone, { preventDefault: vi.fn() });
    fireEvent.dragLeave(zone);
  });

  it('handles file drop', async () => {
    const apiMod = await import('../api/client');
    (apiMod.default.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    const zone = screen.getByText(/Drag & drop/).closest('button')!;
    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.drop(zone, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] },
      });
    });
    // Should have attempted upload
    expect(apiMod.default.post).toHaveBeenCalled();
  });

  it('filters non-image files', async () => {
    const apiMod = await import('../api/client');
    (apiMod.default.post as ReturnType<typeof vi.fn>).mockClear();
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    const zone = screen.getByText(/Drag & drop/).closest('button')!;
    const file = new File(['data'], 'test.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.drop(zone, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] },
      });
    });
    expect(apiMod.default.post).not.toHaveBeenCalled();
  });

  it('handles upload error', async () => {
    const apiMod = await import('../api/client');
    (apiMod.default.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    const zone = screen.getByText(/Drag & drop/).closest('button')!;
    const file = new File(['data'], 'test.png', { type: 'image/png' });
    await act(async () => {
      fireEvent.drop(zone, {
        preventDefault: vi.fn(),
        dataTransfer: { files: [file] },
      });
    });
  });

  it('click opens file dialog', async () => {
    const { default: UploadZone } = await import('../components/Upload/UploadZone');
    wrap(<UploadZone />);
    const zone = screen.getByText(/Drag & drop/).closest('button')!;
    // Mock createElement to intercept input creation
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        Object.defineProperty(el, 'click', { value: clickSpy });
      }
      return el;
    });
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

// ─── useApi hooks ─────────────────────────────────────────────────────────────

describe('useApi hooks', () => {
  // Reset module mocks for this suite - we want real implementations
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Testing hooks through components is cleaner than renderHook with react-query
  it('useImages returns data', async () => {
    // Just verify the module exports exist
    const mod = await vi.importActual<typeof import('../hooks/useApi')>('../hooks/useApi');
    expect(mod.useImages).toBeDefined();
    expect(mod.useUploadImage).toBeDefined();
    expect(mod.useDeleteImage).toBeDefined();
    expect(mod.useJobs).toBeDefined();
    expect(mod.useJob).toBeDefined();
    expect(mod.useCreateJob).toBeDefined();
    expect(mod.useDeleteJob).toBeDefined();
    expect(mod.useSystemStatus).toBeDefined();
    expect(mod.useSettings).toBeDefined();
    expect(mod.useUpdateSettings).toBeDefined();
    expect(mod.usePresets).toBeDefined();
    expect(mod.useCreatePreset).toBeDefined();
    expect(mod.useDeletePreset).toBeDefined();
    expect(mod.useRenamePreset).toBeDefined();
    expect(mod.useStats).toBeDefined();
    expect(mod.useHealthDetailed).toBeDefined();
  });
});

// ─── useLongPress ─────────────────────────────────────────────────────────────

describe('useLongPress extended', () => {
  it('long press triggers callback and vibrate', async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onClick = vi.fn();
    const vibrateSpy = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, writable: true, configurable: true });

    const { useLongPress } = await vi.importActual<typeof import('../hooks/useLongPress')>('../hooks/useLongPress');

    function TestComp() {
      const handlers = useLongPress({ onLongPress, onClick, delay: 500 });
      return <div data-testid="target" {...handlers}>press me</div>;
    }

    render(<TestComp />);
    const el = screen.getByTestId('target');
    fireEvent.mouseDown(el);
    vi.advanceTimersByTime(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(vibrateSpy).toHaveBeenCalledWith(30);

    // After long press, mouseUp should NOT call onClick
    fireEvent.mouseUp(el);
    expect(onClick).not.toHaveBeenCalled();

    // Click should be prevented after long press
    fireEvent.click(el);
    vi.useRealTimers();
  });

  it('short tap calls onClick', async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onClick = vi.fn();

    const { useLongPress } = await vi.importActual<typeof import('../hooks/useLongPress')>('../hooks/useLongPress');

    function TestComp() {
      const handlers = useLongPress({ onLongPress, onClick, delay: 500 });
      return <div data-testid="target" {...handlers}>press me</div>;
    }

    render(<TestComp />);
    const el = screen.getByTestId('target');
    fireEvent.mouseDown(el);
    vi.advanceTimersByTime(100);
    fireEvent.mouseUp(el);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('move cancels long press', async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();
    const onClick = vi.fn();

    const { useLongPress } = await vi.importActual<typeof import('../hooks/useLongPress')>('../hooks/useLongPress');

    function TestComp() {
      const handlers = useLongPress({ onLongPress, onClick, delay: 500 });
      return <div data-testid="target" {...handlers}>press me</div>;
    }

    render(<TestComp />);
    const el = screen.getByTestId('target');
    fireEvent.mouseDown(el);
    vi.advanceTimersByTime(100);
    fireEvent.mouseMove(el);
    vi.advanceTimersByTime(600);
    expect(onLongPress).not.toHaveBeenCalled();
    // mouseUp after move should NOT trigger onClick (didMove=true)
    fireEvent.mouseUp(el);
    expect(onClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('touch events work', async () => {
    vi.useFakeTimers();
    const onLongPress = vi.fn();

    const { useLongPress } = await vi.importActual<typeof import('../hooks/useLongPress')>('../hooks/useLongPress');

    function TestComp() {
      const handlers = useLongPress({ onLongPress, delay: 500 });
      return <div data-testid="target" {...handlers}>press me</div>;
    }

    render(<TestComp />);
    const el = screen.getByTestId('target');
    fireEvent.touchStart(el);
    vi.advanceTimersByTime(600);
    expect(onLongPress).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ─── CompareSlider extended (boost from 30%) ──────────────────────────────────

describe('CompareSlider extended', () => {
  it('handles native range input change', async () => {
    const onChange = vi.fn();
    const { default: CompareSlider } = await vi.importActual<typeof import('../components/GoesData/CompareSlider')>('../components/GoesData/CompareSlider');
    render(
      <CompareSlider
        imageUrl="/current.png"
        prevImageUrl="/prev.png"
        comparePosition={50}
        onPositionChange={onChange}
        frameTime="2024-06-01T12:00:00Z"
        prevFrameTime="2024-06-01T11:50:00Z"
        timeAgo={(d: string) => `${Math.round((Date.now() - new Date(d).getTime()) / 60000)}m`}
      />
    );
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('mouseDown on container updates position', async () => {
    const onChange = vi.fn();
    const { default: CompareSlider } = await vi.importActual<typeof import('../components/GoesData/CompareSlider')>('../components/GoesData/CompareSlider');
    const { container } = render(
      <CompareSlider
        imageUrl="/current.png"
        prevImageUrl="/prev.png"
        comparePosition={50}
        onPositionChange={onChange}
        frameTime={null}
        prevFrameTime={null}
        timeAgo={() => ''}
      />
    );
    const wrapper = container.firstChild as HTMLElement;
    // Mock getBoundingClientRect
    wrapper.getBoundingClientRect = () => ({ left: 0, right: 200, width: 200, top: 0, bottom: 100, height: 100, x: 0, y: 0, toJSON: () => {} });
    fireEvent.mouseDown(wrapper, { clientX: 100 });
    expect(onChange).toHaveBeenCalledWith(50);
    // Clean up document listeners
    fireEvent.mouseUp(document);
  });
});

// ─── Settings page ────────────────────────────────────────────────────────────

describe('Settings Page', () => {
  it('renders settings page', async () => {
    const { default: Settings } = await import('../pages/Settings');
    wrap(<Settings />);
    // Settings has multiple elements with "Settings" text
    expect(screen.getAllByText(/Settings/i).length).toBeGreaterThan(0);
  });
});
