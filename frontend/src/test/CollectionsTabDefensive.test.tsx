import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../components/GoesData/AnimationPlayer', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="animation-player"><button type="button" onClick={onClose}>Close</button></div>
  ),
}));

import CollectionsTab from '../components/GoesData/CollectionsTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/collections') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

describe('CollectionsTab - Defensive Scenarios', () => {
  it('renders create collection input', () => {
    renderWithProviders(<CollectionsTab />);
    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument();
  });

  it('shows loading skeletons', () => {
    mockedApi.get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<CollectionsTab />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows error state when API fails', async () => {
    mockedApi.get.mockRejectedValue(new Error('Server error'));
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
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({
        data: { items: [{ id: '1', name: 'Test', description: 'desc', frame_count: 5, created_at: '2024-01-01' }], total: 1 },
      });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
      expect(screen.getByText('5 frames')).toBeInTheDocument();
    });
  });

  it('handles collections API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create your first collection/i)).toBeInTheDocument();
    });
  });

  it('handles collections API returning undefined', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({ data: undefined });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Create your first collection/i)).toBeInTheDocument();
    });
  });

  it('renders collection with zero frame_count', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({
        data: [{ id: '1', name: 'Empty Col', description: '', frame_count: 0, created_at: '2024-01-01' }],
      });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Empty Col')).toBeInTheDocument();
      expect(screen.getByText('0 frames')).toBeInTheDocument();
    });
  });

  it('renders collection with null frame_count', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({
        data: [{ id: '1', name: 'Null Count', description: '', frame_count: null, created_at: '2024-01-01' }],
      });
      return Promise.resolve({ data: {} });
    });
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
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({
        data: [{ id: '1', name: 'Test', description: '', frame_count: 3, created_at: '2024-01-01' }],
      });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Delete')).toBeInTheDocument();
    });
  });

  it('animate button disabled when frame_count is 0', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({
        data: [{ id: '1', name: 'Empty', description: '', frame_count: 0, created_at: '2024-01-01' }],
      });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CollectionsTab />);
    await waitFor(() => {
      const animBtn = screen.getByLabelText(/Animate collection Empty/);
      expect(animBtn).toBeDisabled();
    });
  });
});
