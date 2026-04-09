import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

vi.mock('../components/GoesData/AnimationPlayer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="animation-player">
      <button onClick={onClose}>Close Player</button>
    </div>
  ),
}));

import CollectionsTab from '../components/GoesData/CollectionsTab';

const server = setupMswServer();

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const collections = [
  {
    id: 'c1',
    name: 'Collection A',
    frame_count: 5,
    created_at: '2026-01-01T00:00:00Z',
    description: 'Test desc',
  },
  {
    id: 'c2',
    name: 'Collection B',
    frame_count: 0,
    created_at: '2026-01-02T00:00:00Z',
    description: '',
  },
];

describe('CollectionsTab extended', () => {
  beforeEach(() => {
    server.use(
      http.get('*/api/satellite/collections', () => HttpResponse.json(collections)),
      http.get('*/api/satellite/collections/:id/frames', () =>
        HttpResponse.json([{ id: 'f1' }, { id: 'f2' }]),
      ),
    );
  });

  it('renders collection cards with data', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    expect(screen.getByText('5 frames')).toBeInTheDocument();
    expect(screen.getByText('Test desc')).toBeInTheDocument();
  });

  it('creates a collection on Enter key', async () => {
    const postSpy = vi.fn<(body: unknown) => void>();
    server.use(
      http.post('*/api/satellite/collections', async ({ request }) => {
        postSpy(await request.json());
        return HttpResponse.json({ id: 'new', name: 'New Coll', frame_count: 0 });
      }),
    );
    renderWith(<CollectionsTab />);
    const input = screen.getByPlaceholderText('New collection name');
    fireEvent.change(input, { target: { value: 'New Coll' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(postSpy).toHaveBeenCalledWith({ name: 'New Coll' }));
  });

  it('creates a collection on button click', async () => {
    const postSpy = vi.fn();
    server.use(
      http.post('*/api/satellite/collections', () => {
        postSpy();
        return HttpResponse.json({ id: 'new', name: 'Test', frame_count: 0 });
      }),
    );
    renderWith(<CollectionsTab />);
    fireEvent.change(screen.getByPlaceholderText('New collection name'), {
      target: { value: 'Test' },
    });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(postSpy).toHaveBeenCalled());
  });

  it('does not create when name is empty', () => {
    renderWith(<CollectionsTab />);
    expect(screen.getByText('Create').closest('button')).toBeDisabled();
  });

  it('enters edit mode and saves', async () => {
    const putSpy = vi.fn<(url: string, body: unknown) => void>();
    server.use(
      http.put('*/api/satellite/collections/:id', async ({ request, params }) => {
        putSpy(`/satellite/collections/${params.id}`, await request.json());
        return HttpResponse.json({ id: params.id, name: 'Renamed', frame_count: 5 });
      }),
    );
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    const editBtns = screen.getAllByText('Edit');
    fireEvent.click(editBtns[0]);
    const editInput = screen.getByLabelText('Edit collection name');
    fireEvent.change(editInput, { target: { value: 'Renamed' } });
    fireEvent.keyDown(editInput, { key: 'Enter' });
    await waitFor(() =>
      expect(putSpy).toHaveBeenCalledWith('/satellite/collections/c1', { name: 'Renamed' }),
    );
  });

  it('cancels edit mode', async () => {
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Collection A')).toBeInTheDocument();
  });

  it('saves edit via Save button', async () => {
    const putSpy = vi.fn();
    server.use(
      http.put('*/api/satellite/collections/:id', () => {
        putSpy();
        return HttpResponse.json({ id: 'c1', name: 'Updated', frame_count: 5 });
      }),
    );
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Edit')[0]);
    fireEvent.change(screen.getByLabelText('Edit collection name'), {
      target: { value: 'Updated' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(putSpy).toHaveBeenCalled());
  });

  it('deletes a collection', async () => {
    const deleteSpy = vi.fn<(url: string) => void>();
    server.use(
      http.delete('*/api/satellite/collections/:id', ({ params }) => {
        deleteSpy(`/satellite/collections/${params.id}`);
        return HttpResponse.json({ ok: true });
      }),
    );
    renderWith(<CollectionsTab />);
    await waitFor(() => expect(screen.getByText('Collection A')).toBeInTheDocument());
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/satellite/collections/c1'));
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
    server.use(http.get('*/api/satellite/collections', () => HttpResponse.json([])));
    renderWith(<CollectionsTab />);
    await waitFor(() =>
      expect(screen.getByText(/create your first collection/i)).toBeInTheDocument(),
    );
  });
});
