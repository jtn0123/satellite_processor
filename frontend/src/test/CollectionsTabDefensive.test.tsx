import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../components/GoesData/AnimationPlayer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="animation-player">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

import CollectionsTab from '../components/GoesData/CollectionsTab';

const server = setupMswServer();

describe('CollectionsTab - Defensive Scenarios', () => {
  it('renders create collection input', () => {
    renderWithProviders(<CollectionsTab />);
    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument();
  });

  it('shows loading skeletons', () => {
    // Never-resolving handler to keep query in pending state.
    server.use(
      http.get('*/api/satellite/collections', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderWithProviders(<CollectionsTab />);
    const pulseElements = document.querySelectorAll('.skeleton-shimmer');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows error state when API fails', async () => {
    server.use(http.get('*/api/satellite/collections', () => HttpResponse.error()));
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load collections/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no collections', async () => {
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create your first collection/i)).toBeInTheDocument();
    });
  });

  it('handles collections API returning paginated object', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json({
          items: [
            {
              id: '1',
              name: 'Test',
              description: 'desc',
              frame_count: 5,
              created_at: '2024-01-01',
            },
          ],
          total: 1,
        }),
      ),
    );
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.getByText('5 frames')).toBeInTheDocument();
    });
  });

  it('handles collections API returning null', async () => {
    server.use(http.get('*/api/satellite/collections', () => HttpResponse.json(null)));
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create your first collection/i)).toBeInTheDocument();
    });
  });

  it('handles collections API returning undefined', async () => {
    server.use(
      http.get('*/api/satellite/collections', () => new HttpResponse('', { status: 200 })),
    );
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create your first collection/i)).toBeInTheDocument();
    });
  });

  it('renders collection with zero frame_count', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json([
          {
            id: '1',
            name: 'Empty Col',
            description: '',
            frame_count: 0,
            created_at: '2024-01-01',
          },
        ]),
      ),
    );
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Empty Col')).toBeInTheDocument();
      expect(screen.getByText('0 frames')).toBeInTheDocument();
    });
  });

  it('renders collection with null frame_count', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json([
          {
            id: '1',
            name: 'Null Count',
            description: '',
            frame_count: null,
            created_at: '2024-01-01',
          },
        ]),
      ),
    );
    const { container } = renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(container.innerHTML).toContain('Null Count');
      expect(screen.getByText('0 frames')).toBeInTheDocument();
    });
  });

  it('create button is disabled when name is empty', () => {
    renderWithProviders(<CollectionsTab />);
    const createBtn = screen.getByText('Create');
    expect(createBtn).toBeDisabled();
  });

  it('create button enables when name is typed', () => {
    renderWithProviders(<CollectionsTab />);
    const input = screen.getByPlaceholderText(/collection name/i);
    fireEvent.change(input, { target: { value: 'New Collection' } });
    const createBtn = screen.getByText('Create');
    expect(createBtn).not.toBeDisabled();
  });

  it('shows edit/delete buttons on collection cards', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json([
          { id: '1', name: 'Test', description: '', frame_count: 3, created_at: '2024-01-01' },
        ]),
      ),
    );
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('animate button disabled when frame_count is 0', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json([
          { id: '1', name: 'Empty', description: '', frame_count: 0, created_at: '2024-01-01' },
        ]),
      ),
    );
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      const animBtn = screen.getByLabelText(/Animate collection Empty/);
      expect(animBtn).toBeDisabled();
    });
  });
});
