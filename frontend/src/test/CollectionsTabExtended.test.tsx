import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockGet = vi.fn((_url?: string) => Promise.resolve({ data: [] as unknown[] }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockPost = vi.fn((_url?: string, _data?: unknown) => Promise.resolve({ data: {} }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockPut = vi.fn((_url?: string, _data?: unknown) => Promise.resolve({ data: {} }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mockDelete = vi.fn((_url?: string) => Promise.resolve({}));

vi.mock('../api/client', () => ({
  default: {
    get: (url: string) => mockGet(url),
    post: (url: string, data: unknown) => mockPost(url, data),
    put: (url: string, data: unknown) => mockPut(url, data),
    delete: (url: string) => mockDelete(url),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

vi.mock('../components/GoesData/AnimationPlayer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="animation-player"><button onClick={onClose}>Close Player</button></div>
  ),
}));

import CollectionsTab from '../components/GoesData/CollectionsTab';

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const collections = [
  { id: 'c1', name: 'Collection A', frame_count: 5, created_at: '2026-01-01T00:00:00Z', description: 'Test desc' },
  { id: 'c2', name: 'Collection B', frame_count: 0, created_at: '2026-01-02T00:00:00Z', description: '' },
];

describe('CollectionsTab extended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url?: string) => {
      if (url === '/goes/collections') return Promise.resolve({ data: collections });
      if (url?.includes('/frames')) return Promise.resolve({ data: [{ id: 'f1' }, { id: 'f2' }] });
      return Promise.resolve({ data: [] });
    });
  });

  it('renders collection cards with data', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    expect(screen.getByText('5 frames')).toBeInTheDocument();
    expect(screen.getByText('Test desc')).toBeInTheDocument();
  });

  it('creates a collection on Enter key', async () => {
    renderWith(<CollectionsTab />);
    const input = screen.getByPlaceholderText('New collection name');
    fireEvent.change(input, { target: { value: 'New Coll' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/goes/collections', { name: 'New Coll' }));
  });

  it('creates a collection on button click', async () => {
    renderWith(<CollectionsTab />);
    fireEvent.change(screen.getByPlaceholderText('New collection name'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(mockPost).toHaveBeenCalled());
  });

  it('does not create when name is empty', () => {
    renderWith(<CollectionsTab />);
    expect(screen.getByText('Create').closest('button')).toBeDisabled();
  });

  it('enters edit mode and saves', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    const editBtns = screen.getAllByText('Edit');
    fireEvent.click(editBtns[0]);
    const editInput = screen.getByLabelText('Edit collection name');
    fireEvent.change(editInput, { target: { value: 'Renamed' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith('/goes/collections/c1', { name: 'Renamed' }));
  });

  it('cancels edit mode', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Collection A')).toBeInTheDocument();
  });

  it('saves edit via Save button', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.change(screen.getByLabelText('Edit collection name'), { target: { value: 'Updated' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(mockPut).toHaveBeenCalled());
  });

  it('deletes a collection', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('/goes/collections/c1'));
  });

  it('opens animation player on animate click', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Animate collection Collection A'));
    await waitFor(() => expect(screen.getByTestId('animation-player')).toBeInTheDocument());
  });

  it('closes animation player', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Animate collection Collection A'));
    await waitFor(() => expect(screen.getByTestId('animation-player')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Close Player'));
    await waitFor(() => expect(screen.queryByTestId('animation-player')).not.toBeInTheDocument());
  });

  it('animate button disabled when frame_count is 0', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection B')).toBeInTheDocument());
    expect(screen.getByLabelText('Animate collection Collection B')).toBeDisabled();
  });

  it('renders export button', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    expect(screen.getByLabelText('Export collection Collection A')).toBeInTheDocument();
  });

  it('shows empty state when no collections', async () => {
    mockGet.mockImplementation(() => Promise.resolve({ data: [] }));
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText(/create your first collection/i)).toBeInTheDocument());
  });
});
