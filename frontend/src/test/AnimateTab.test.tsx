import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnimateTab from '../components/Animation/AnimateTab';

// Mock api client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { frames: [], total_count: 0, capture_interval_minutes: 10 } }),
    post: vi.fn().mockResolvedValue({ data: { id: 'mock-anim-1', status: 'pending' } }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe('AnimateTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders satellite selector', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
  });

  it('renders quick hour buttons', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('3h')).toBeInTheDocument();
    expect(screen.getByText('6h')).toBeInTheDocument();
    expect(screen.getByText('12h')).toBeInTheDocument();
    expect(screen.getByText('24h')).toBeInTheDocument();
  });

  it('clicking quick hour sets date range', async () => {
    renderWithProviders(<AnimateTab />);
    const btn = screen.getByText('1h');
    fireEvent.click(btn);

    // After clicking, the date inputs should have values
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders format selector with mp4 default', () => {
    renderWithProviders(<AnimateTab />);
    // There should be a format selection showing mp4
    const mp4Element = screen.getByDisplayValue?.('mp4') ?? screen.queryByText('mp4');
    expect(mp4Element).toBeTruthy();
  });

  it('renders generate button', () => {
    renderWithProviders(<AnimateTab />);
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    expect(generateBtn).toBeInTheDocument();
  });
});
