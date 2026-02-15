import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockRenameMutate = vi.fn();

vi.mock('../hooks/useApi', () => ({
  usePresets: vi.fn(() => ({ data: [] })),
  useCreatePreset: vi.fn(() => ({ mutate: mockMutate, isPending: false })),
  useDeletePreset: vi.fn(() => ({ mutate: mockDeleteMutate })),
  useRenamePreset: vi.fn(() => ({ mutate: mockRenameMutate })),
}));

import PresetManager from '../components/Processing/PresetManager';
import * as apiHooks from '../hooks/useApi';

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockPresets = [
  { id: '1', name: 'Preset A', params: { fps: 10 }, created_at: '2026-01-01' },
  { id: '2', name: 'Preset B', params: { fps: 20 }, created_at: '2026-01-02' },
];

describe('PresetManager', () => {
  const onLoadPreset = vi.fn();
  const currentParams = { fps: 15, format: 'mp4' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders heading and save input', () => {
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    expect(screen.getByText('Presets')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/preset name/i)).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('save button is disabled when input is empty', () => {
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    expect(screen.getByText('Save').closest('button')).toBeDisabled();
  });

  it('calls createPreset.mutate on save click', () => {
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: 'My Preset' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockMutate).toHaveBeenCalledWith(
      { name: 'My Preset', params: currentParams },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('calls createPreset on Enter key', () => {
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    const input = screen.getByPlaceholderText(/preset name/i);
    fireEvent.change(input, { target: { value: 'Enter Preset' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockMutate).toHaveBeenCalled();
  });

  it('does not save when name is whitespace only', () => {
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.change(screen.getByPlaceholderText(/preset name/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save'));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('renders preset list when presets exist', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    expect(screen.getByText('Preset A')).toBeInTheDocument();
    expect(screen.getByText('Preset B')).toBeInTheDocument();
  });

  it('calls onLoadPreset when preset name is clicked', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getByText('Preset A'));
    expect(onLoadPreset).toHaveBeenCalledWith({ fps: 10 });
  });

  it('enters rename mode and submits new name', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getAllByTitle('Rename')[0]);
    const renameInput = screen.getByDisplayValue('Preset A');
    fireEvent.change(renameInput, { target: { value: 'New Name' } });
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    expect(mockRenameMutate).toHaveBeenCalledWith(
      { oldName: 'Preset A', newName: 'New Name' },
      expect.any(Object)
    );
  });

  it('cancels rename on Escape', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getAllByTitle('Rename')[0]);
    const renameInput = screen.getByDisplayValue('Preset A');
    fireEvent.keyDown(renameInput, { key: 'Escape' });
    expect(screen.getByText('Preset A')).toBeInTheDocument();
  });

  it('cancels rename when new name is same as old', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getAllByTitle('Rename')[0]);
    const renameInput = screen.getByDisplayValue('Preset A');
    fireEvent.keyDown(renameInput, { key: 'Enter' });
    expect(mockRenameMutate).not.toHaveBeenCalled();
  });

  it('deletes preset with confirmation', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    globalThis.confirm = vi.fn(() => true);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    expect(mockDeleteMutate).toHaveBeenCalledWith('Preset A');
  });

  it('does not delete when confirmation is cancelled', () => {
    vi.mocked(apiHooks.usePresets).mockReturnValue({ data: mockPresets } as never);
    globalThis.confirm = vi.fn(() => false);
    renderWith(<PresetManager currentParams={currentParams} onLoadPreset={onLoadPreset} />);
    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
