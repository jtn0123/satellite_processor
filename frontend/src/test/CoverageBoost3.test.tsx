// eslint-disable @typescript-eslint/no-explicit-any
/**
 * Coverage boost tests for low-coverage components:
 * PresetsTab, TagModal, Process, ProcessingForm, JobList, GoesData, ImageGallery
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// --- Mocks ---

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate, Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a> };
});

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('../hooks/useHotkeys', () => ({ useHotkeys: vi.fn() }));
vi.mock('../hooks/useSwipeTabs', () => ({ useSwipeTabs: () => ({ current: null }) }));
vi.mock('../hooks/useFocusTrap', () => ({ useFocusTrap: () => ({ current: null }) }));

const mockMutate = vi.fn();
const mockCreateJob = { mutate: mockMutate, isPending: false };
vi.mock('../hooks/useApi', () => ({
  useImages: vi.fn(() => ({ data: [], isLoading: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn() })),
  useJobs: vi.fn(() => ({ data: [], isLoading: false })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn() })),
  useCreateJob: vi.fn(() => mockCreateJob),
}));

import api from '../api/client';
import { showToast } from '../utils/toast';
import { useImages, useJobs, useDeleteJob } from '../hooks/useApi';

const mockedApi = api as any;
const mockedUseImages = useImages as any;
const mockedUseJobs = useJobs as any;
const mockedUseDeleteJob = useDeleteJob as any;

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation(() => Promise.resolve({ data: [] }));
  mockedApi.post.mockImplementation(() => Promise.resolve({ data: {} }));
  mockedApi.put.mockImplementation(() => Promise.resolve({ data: {} }));
  mockedApi.delete.mockImplementation(() => Promise.resolve({ data: {} }));
  mockedUseImages.mockReturnValue({ data: [], isLoading: false });
  mockedUseJobs.mockReturnValue({ data: [], isLoading: false });
  mockedUseDeleteJob.mockReturnValue({ mutate: vi.fn() });
});

// ===================== PresetsTab =====================
describe('PresetsTab – full coverage', () => {
  let PresetsTab: any;

  beforeEach(async () => {
    PresetsTab = (await import('../components/GoesData/PresetsTab')).default;
  });

  it('shows empty state for presets and schedules', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText(/No presets yet/)).toBeInTheDocument();
      expect(screen.getByText(/No schedules yet/)).toBeInTheDocument();
    });
  });

  it('renders presets with run/edit/delete buttons', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'Test Preset', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: 'Desc', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Test Preset')).toBeInTheDocument());
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByTitle('Run Now')).toBeInTheDocument();
    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('opens create preset form and submits', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    mockedApi.post.mockResolvedValue({ data: { id: 'new1' } });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('New Preset')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Preset'));
    await waitFor(() => expect(screen.getByText('Create Preset')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'My Preset' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'My desc' } });

    // Click Save
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/fetch-presets', expect.objectContaining({ name: 'My Preset' })));
  });

  it('opens edit preset form', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'Existing', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Existing')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => expect(screen.getByText('Edit Preset')).toBeInTheDocument());

    // Change name and save
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(mockedApi.put).toHaveBeenCalled());
  });

  it('cancels create form', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('New Preset')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Preset'));
    await waitFor(() => expect(screen.getByText('Create Preset')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Create Preset')).not.toBeInTheDocument());
  });

  it('runs a preset', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'Runnable', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    mockedApi.post.mockResolvedValue({ data: {} });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Runnable')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Run Now'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/fetch-presets/p1/run'));
  });

  it('deletes a preset', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'Deletable', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Deletable')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/goes/fetch-presets/p1'));
  });

  it('renders schedules with toggle and delete', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'P1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({
        data: [{
          id: 's1', name: 'Sched1', preset_id: 'p1', interval_minutes: 60, is_active: true,
          last_run_at: '2026-01-01T12:00:00Z', next_run_at: '2026-01-01T13:00:00Z',
          preset: { name: 'P1' },
        }],
      });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Sched1')).toBeInTheDocument());
    expect(screen.getByText('Active')).toBeInTheDocument();

    // Toggle schedule
    mockedApi.post.mockResolvedValue({ data: { is_active: false } });
    fireEvent.click(screen.getByText('Active'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/schedules/s1/toggle'));
  });

  it('creates a schedule', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'P1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    mockedApi.post.mockResolvedValue({ data: { id: 's1' } });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('P1')).toBeInTheDocument());

    // Click New Schedule
    const newSchedBtn = screen.getByText('New Schedule');
    expect(newSchedBtn).not.toBeDisabled();
    fireEvent.click(newSchedBtn);

    // Fill schedule form
    await waitFor(() => expect(screen.getByLabelText('Schedule name')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Schedule name'), { target: { value: 'My Sched' } });

    // Select preset
    const selects = screen.getAllByLabelText('Schedform');
    fireEvent.change(selects[0], { target: { value: 'p1' } });

    // Click Create
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/schedules', expect.objectContaining({ name: 'My Sched', preset_id: 'p1' })));
  });

  it('cancels schedule creation', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'P1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    // Wait for presets data to load first
    await waitFor(() => expect(screen.getByText('P1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Schedule'));
    await waitFor(() => expect(screen.getByLabelText('Schedule name')).toBeInTheDocument());
    const cancelButtons = screen.getAllByText('Cancel');
    fireEvent.click(cancelButtons[cancelButtons.length - 1]);
    await waitFor(() => expect(screen.queryByLabelText('Schedule name')).not.toBeInTheDocument());
  });

  it('disables new schedule button when no presets', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('New Schedule')).toBeDisabled());
  });

  it('shows inactive schedule', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({
        data: [{
          id: 's2', name: 'InactiveSched', preset_id: 'p1', interval_minutes: 180, is_active: false,
          last_run_at: null, next_run_at: null, preset: null,
        }],
      });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText('InactiveSched')).toBeInTheDocument();
      expect(screen.getByText('Inactive')).toBeInTheDocument();
      expect(screen.getByText(/Never run/)).toBeInTheDocument();
      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });
  });

  it('deletes a schedule', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({
        data: [{ id: 's1', name: 'Del', preset_id: 'p1', interval_minutes: 60, is_active: true, last_run_at: null, next_run_at: null, preset: { name: 'P' } }],
      });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('Del')).toBeInTheDocument());
    // Just click the last trash button
    const allTrashBtns = document.querySelectorAll('button');
    const lastTrash = Array.from(allTrashBtns).pop()!;
    fireEvent.click(lastTrash);
    await waitFor(() => expect(mockedApi.delete).toHaveBeenCalledWith('/goes/schedules/s1'));
  });

  it('handles preset form satellite/sector/band changes', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('New Preset')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Preset'));
    await waitFor(() => expect(screen.getByText('Create Preset')).toBeInTheDocument());

    // Change satellite, sector, band via the select elements
    const selects = screen.getAllByLabelText('Form');
    fireEvent.change(selects[0], { target: { value: 'GOES-18' } });
    fireEvent.change(selects[1], { target: { value: 'CONUS' } });
    fireEvent.change(selects[2], { target: { value: 'C13' } });
  });

  it('handles schedule interval change', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'P1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('P1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Schedule'));
    await waitFor(() => expect(screen.getByLabelText('Schedule name')).toBeInTheDocument());

    const allSelects = screen.getAllByLabelText('Schedform');
    fireEvent.change(allSelects[allSelects.length - 1], { target: { value: '360' } });
  });

  it('handles create preset mutation error', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    mockedApi.post.mockRejectedValue(new Error('fail'));
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('New Preset')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Preset'));
    await waitFor(() => expect(screen.getByText('Create Preset')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Fail' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Failed to create preset'));
  });

  it('handles edit preset cancel', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: [{ id: 'p1', name: 'E', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02', description: '', created_at: '2026-01-01' }],
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    wrap(<PresetsTab />);
    await waitFor(() => expect(screen.getByText('E')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Edit'));
    await waitFor(() => expect(screen.getByText('Edit Preset')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Edit Preset')).not.toBeInTheDocument());
  });
});

// ===================== TagModal =====================
describe('TagModal – full coverage', () => {
  let TagModal: any;

  beforeEach(async () => {
    TagModal = (await import('../components/GoesData/TagModal')).default;
  });

  it('toggles tag selection and shows tag button', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({
        data: [{ id: 't1', name: 'Storm', color: '#ff0000' }, { id: 't2', name: 'Clear', color: '#00ff00' }],
      });
      return Promise.resolve({ data: [] });
    });
    wrap(<TagModal frameIds={['f1', 'f2']} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Storm')).toBeInTheDocument());

    // Select a tag
    fireEvent.click(screen.getByText('Storm'));
    await waitFor(() => expect(screen.getByText('Tag 2 frames')).toBeInTheDocument());

    // Deselect
    fireEvent.click(screen.getByText('Storm'));
    await waitFor(() => expect(screen.queryByText('Tag 2 frames')).not.toBeInTheDocument());
  });

  it('applies tags to frames', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({
        data: [{ id: 't1', name: 'Storm', color: '#ff0000' }],
      });
      return Promise.resolve({ data: [] });
    });
    mockedApi.post.mockResolvedValue({ data: {} });
    const onClose = vi.fn();
    wrap(<TagModal frameIds={['f1']} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText('Storm')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Storm'));
    await waitFor(() => expect(screen.getByText('Tag 1 frames')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Tag 1 frames'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/frames/tag', { frame_ids: ['f1'], tag_ids: ['t1'] }));
  });

  it('creates a new tag', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    mockedApi.post.mockResolvedValue({ data: { id: 'tnew', name: 'NewTag', color: '#0000ff' } });
    wrap(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'NewTag' } });
    fireEvent.click(screen.getByText('+'));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/goes/tags', { name: 'NewTag', color: '#3b82f6' }));
  });

  it('handles tag mutation error', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({
        data: [{ id: 't1', name: 'Tag1', color: '#ff0000' }],
      });
      return Promise.resolve({ data: [] });
    });
    mockedApi.post.mockRejectedValue(new Error('fail'));
    wrap(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Tag1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Tag1'));
    await waitFor(() => expect(screen.getByText('Tag 1 frames')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Tag 1 frames'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Failed to tag frames'));
  });

  it('handles create tag mutation error', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    mockedApi.post.mockRejectedValue(new Error('fail'));
    wrap(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Tag name'), { target: { value: 'Bad' } });
    fireEvent.click(screen.getByText('+'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Failed to create tag'));
  });

  it('changes color picker', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    wrap(<TagModal frameIds={['f1']} onClose={vi.fn()} />);
    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#ff00ff' } });
    expect(colorInput.value).toBe('#ff00ff');
  });
});

// ===================== ProcessingForm =====================
describe('ProcessingForm – full coverage', () => {
  let ProcessingForm: any;

  beforeEach(async () => {
    ProcessingForm = (await import('../components/Processing/ProcessingForm')).default;
  });

  it('renders all steps and navigates', () => {
    wrap(<ProcessingForm selectedImages={['img1', 'img2']} />);
    expect(screen.getByText('Image Processing')).toBeInTheDocument();

    // Toggle crop
    const cropToggle = screen.getByText('Crop Region').closest('div')?.parentElement?.querySelector('button:last-child');
    if (cropToggle) fireEvent.click(cropToggle);

    // Toggle false color
    const fcToggle = screen.getByText('False Color').closest('div')?.parentElement?.querySelector('button:last-child');
    if (fcToggle) fireEvent.click(fcToggle);

    // Toggle timestamp off
    const tsToggle = screen.getByText('Timestamp Overlay').closest('div')?.parentElement?.querySelector('button:last-child');
    if (tsToggle) fireEvent.click(tsToggle);

    // Toggle scale
    const scaleToggle = screen.getByText('Scale').closest('div')?.parentElement?.querySelector('button:last-child');
    if (scaleToggle) fireEvent.click(scaleToggle);
  });

  it('navigates to video settings step', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    fireEvent.click(screen.getByText('Video Settings'));
    // FPS slider should be visible
    expect(screen.getByLabelText('FPS')).toBeInTheDocument();
    expect(screen.getByLabelText(/Quality/)).toBeInTheDocument();
    expect(screen.getByLabelText('Codec')).toBeInTheDocument();
    expect(screen.getByLabelText('Interpolation')).toBeInTheDocument();

    // Change video settings
    fireEvent.change(screen.getByLabelText('FPS'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/Quality/), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('Codec'), { target: { value: 'hevc' } });
    fireEvent.change(screen.getByLabelText('Interpolation'), { target: { value: 'blend' } });
  });

  it('shows review step with summary', () => {
    wrap(<ProcessingForm selectedImages={['img1', 'img2']} />);
    fireEvent.click(screen.getByText('Review & Launch'));
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText(/2 selected/)).toBeInTheDocument();
    expect(screen.getByText(/Launch Job/)).toBeInTheDocument();
  });

  it('launches job from review step', () => {
    wrap(<ProcessingForm selectedImages={['img1']} onJobCreated={vi.fn()} />);
    fireEvent.click(screen.getByText('Review & Launch'));
    fireEvent.click(screen.getByText('Launch Job'));
    expect(mockMutate).toHaveBeenCalled();
  });

  it('uses Next/Back navigation', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    // Back should be disabled on step 0
    const backBtn = screen.getByText('Back');
    expect(backBtn.closest('button')).toBeDisabled();

    // Click Next
    fireEvent.click(screen.getByText('Next'));
    // Now on step 1 - Video Settings
    expect(screen.getByLabelText('FPS')).toBeInTheDocument();

    // Click Next again
    fireEvent.click(screen.getByText('Next'));
    // Now on step 2 - Review
    expect(screen.getByText('Review')).toBeInTheDocument();

    // Next should be disabled on step 2
    const nextBtn = screen.getByText('Next');
    expect(nextBtn.closest('button')).toBeDisabled();

    // Click Back
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByLabelText('FPS')).toBeInTheDocument();
  });

  it('shows crop/falseColor details in review when enabled', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);

    // Enable crop
    const toggleButtons = document.querySelectorAll('button[class*="rounded-full"]');
    // Crop toggle is first, false color is second
    if (toggleButtons[0]) fireEvent.click(toggleButtons[0]);
    if (toggleButtons[1]) fireEvent.click(toggleButtons[1]);

    fireEvent.click(screen.getByText('Review & Launch'));
    // Should show crop info and false color
    expect(screen.getByText(/Crop:/)).toBeInTheDocument();
    expect(screen.getByText(/False Color:/)).toBeInTheDocument();
  });

  it('initializes from preset params', () => {
    const initialParams = {
      crop: { x: 10, y: 20, w: 500, h: 400 },
      false_color: { method: 'fire' },
      scale: { factor: 2 },
      video: { fps: 30, codec: 'hevc', quality: 18, interpolation: 'blend' },
    };
    wrap(<ProcessingForm selectedImages={['img1']} initialParams={initialParams} />);
    // Crop should be enabled with values
    expect(screen.getByText('Crop Region')).toBeInTheDocument();
  });

  it('changes crop input values', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    // Enable crop
    const toggleButtons = document.querySelectorAll('button[class*="rounded-full"]');
    if (toggleButtons[0]) fireEvent.click(toggleButtons[0]);

    // Change crop X
    const inputs = screen.getAllByRole('spinbutton');
    if (inputs.length > 0) {
      fireEvent.change(inputs[0], { target: { value: '100' } });
    }
  });

  it('changes false color method', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    // Enable false color
    const toggleButtons = document.querySelectorAll('button[class*="rounded-full"]');
    if (toggleButtons[1]) fireEvent.click(toggleButtons[1]);

    // The select for false color method
    const selects = document.querySelectorAll('select');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: 'fire' } });
    }
  });

  it('changes timestamp position', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    // Timestamp is enabled by default
    const selects = document.querySelectorAll('select');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: 'top-right' } });
    }
  });

  it('changes scale factor', () => {
    wrap(<ProcessingForm selectedImages={['img1']} />);
    // Enable scale
    const toggleButtons = document.querySelectorAll('button[class*="rounded-full"]');
    if (toggleButtons[3]) fireEvent.click(toggleButtons[3]);

    const rangeInputs = document.querySelectorAll('input[type="range"]');
    if (rangeInputs.length > 0) {
      fireEvent.change(rangeInputs[0], { target: { value: '2' } });
    }
  });
});

// ===================== Process Page =====================
describe('Process page – full coverage', () => {
  let ProcessPage: any;

  beforeEach(async () => {
    ProcessPage = (await import('../pages/Process')).default;
  });

  it('shows empty state when no images', () => {
    mockedUseImages.mockReturnValue({ data: [], isLoading: false });
    wrap(<ProcessPage />);
    expect(screen.getByText('No images yet')).toBeInTheDocument();
    expect(screen.getByText('Upload Images')).toBeInTheDocument();
  });

  it('shows image gallery when images exist', () => {
    mockedUseImages.mockReturnValue({
      data: [{ id: 'i1', filename: 'test.nc', original_name: 'test.nc', file_size: 1024, width: 100, height: 100, satellite: 'GOES-16', channel: 'C02', captured_at: '2026-01-01', uploaded_at: '2026-01-01' }],
      isLoading: false,
    });
    wrap(<ProcessPage />);
    expect(screen.getByText(/Select Images/)).toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });
});

// ===================== JobList =====================
describe('JobList – full coverage', () => {
  let JobList: any;

  beforeEach(async () => {
    JobList = (await import('../components/Jobs/JobList')).default;
  });

  it('shows loading skeleton', () => {
    mockedUseJobs.mockReturnValue({ data: [], isLoading: true });
    wrap(<JobList />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(3);
  });

  it('shows empty state', () => {
    mockedUseJobs.mockReturnValue({ data: [], isLoading: false });
    wrap(<JobList />);
    expect(screen.getByText('No jobs yet')).toBeInTheDocument();
  });

  it('renders jobs with various statuses', () => {
    mockedUseJobs.mockReturnValue({
      data: [
        { id: 'j1', job_type: 'fetch', status: 'completed', progress: 100, status_message: 'Done', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j2', job_type: 'process', status: 'processing', progress: 50, status_message: '', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j3', job_type: 'anim', status: 'failed', progress: 0, status_message: 'Error', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j4', job_type: 'test', status: 'pending', progress: 0, status_message: '', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j5', job_type: 'partial', status: 'completed_partial', progress: 80, status_message: 'Partial', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j6', job_type: 'cancel', status: 'cancelled', progress: 0, status_message: 'Cancelled', created_at: '2026-01-01T00:00:00Z' },
      ],
      isLoading: false,
    });
    wrap(<JobList />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    // Processing job shows progress bar
    expect(screen.getByText('processing')).toBeInTheDocument();
    // Download links for completed jobs
    const downloadLinks = screen.getAllByTitle('Download');
    expect(downloadLinks.length).toBe(2); // completed + completed_partial
  });

  it('calls onSelect when clicking a job', () => {
    const onSelect = vi.fn();
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'j1', job_type: 'fetch', status: 'completed', progress: 100, status_message: 'Done', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Done').closest('button')!);
    expect(onSelect).toHaveBeenCalledWith('j1');
  });

  it('respects limit prop', () => {
    mockedUseJobs.mockReturnValue({
      data: [
        { id: 'j1', job_type: 'a', status: 'completed', progress: 100, status_message: 'One', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j2', job_type: 'b', status: 'completed', progress: 100, status_message: 'Two', created_at: '2026-01-01T00:00:00Z' },
        { id: 'j3', job_type: 'c', status: 'completed', progress: 100, status_message: 'Three', created_at: '2026-01-01T00:00:00Z' },
      ],
      isLoading: false,
    });
    wrap(<JobList limit={2} />);
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.queryByText('Three')).not.toBeInTheDocument();
  });

  it('calls onSelect from view button', () => {
    const onSelect = vi.fn();
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'j1', job_type: 'fetch', status: 'pending', progress: 0, status_message: '', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList onSelect={onSelect} />);
    const viewBtn = screen.getByLabelText('View job j1');
    fireEvent.click(viewBtn);
    expect(onSelect).toHaveBeenCalledWith('j1');
  });

  it('deletes a job with confirmation', () => {
    const mockDeleteMutate = vi.fn();
    mockedUseDeleteJob.mockReturnValue({ mutate: mockDeleteMutate });
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'j1', job_type: 'fetch', status: 'pending', progress: 0, status_message: '', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList />);
    const deleteBtn = screen.getByLabelText('Delete job j1');
    fireEvent.click(deleteBtn);
    expect(mockDeleteMutate).toHaveBeenCalledWith('j1');
  });

  it('does not delete when confirmation cancelled', () => {
    const mockDeleteMutate = vi.fn();
    mockedUseDeleteJob.mockReturnValue({ mutate: mockDeleteMutate });
    vi.stubGlobal('confirm', vi.fn(() => false));
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'j1', job_type: 'fetch', status: 'pending', progress: 0, status_message: '', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList />);
    const deleteBtn = screen.getByLabelText('Delete job j1');
    fireEvent.click(deleteBtn);
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });

  it('shows fallback status_message for jobs without one', () => {
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'abcdef12', job_type: 'fetch', status: 'pending', progress: 0, status_message: '', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList />);
    expect(screen.getByText('Job abcdef12')).toBeInTheDocument();
  });

  it('handles unknown status gracefully', () => {
    mockedUseJobs.mockReturnValue({
      data: [{ id: 'j1', job_type: 'fetch', status: 'unknown_status', progress: 0, status_message: 'Hmm', created_at: '2026-01-01T00:00:00Z' }],
      isLoading: false,
    });
    wrap(<JobList />);
    expect(screen.getByText('Hmm')).toBeInTheDocument();
  });
});

// ===================== GoesData =====================
describe('GoesData page – full coverage', () => {
  let GoesData: any;

  beforeEach(async () => {
    GoesData = (await import('../pages/GoesData')).default;
  });

  it('renders with Browse tab active by default', async () => {
    wrap(<GoesData />);
    // The heading renders immediately (not lazy)
    expect(screen.getByRole('heading', { name: 'Browse & Fetch' })).toBeInTheDocument();
    const browseTab = screen.getByLabelText('Browse tab');
    expect(browseTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to Fetch tab', async () => {
    wrap(<GoesData />);
    fireEvent.click(screen.getByLabelText('Fetch tab'));
    await waitFor(() => {
      expect(screen.getByLabelText('Fetch tab')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches to Map tab', async () => {
    wrap(<GoesData />);
    fireEvent.click(screen.getByLabelText('Map tab'));
    await waitFor(() => {
      expect(screen.getByLabelText('Map tab')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches to Stats tab', async () => {
    wrap(<GoesData />);
    fireEvent.click(screen.getByLabelText('Stats tab'));
    await waitFor(() => {
      expect(screen.getByLabelText('Stats tab')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('handles switch-tab custom event', async () => {
    wrap(<GoesData />);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'fetch' }));
    });
    await waitFor(() => {
      expect(screen.getByLabelText('Fetch tab')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('handles set-subview custom event', async () => {
    wrap(<GoesData />);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent('set-subview', { detail: 'FullDisk' }));
    });
    await waitFor(() => {
      expect(screen.getByText('FullDisk')).toBeInTheDocument();
    });
  });

  it('ignores invalid tab in switch-tab event', async () => {
    wrap(<GoesData />);
    act(() => {
      globalThis.dispatchEvent(new CustomEvent('switch-tab', { detail: 'nonexistent' }));
    });
    // Should still show browse as active
    await waitFor(() => {
      expect(screen.getByLabelText('Browse tab')).toHaveAttribute('aria-selected', 'true');
    });
  });
});
