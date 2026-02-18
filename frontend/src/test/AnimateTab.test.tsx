import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnimateTab from '../components/Animation/AnimateTab';

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

describe('AnimateTab (Unified)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders satellite selector', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
  });

  it('renders quick hour buttons', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Last 1h')).toBeInTheDocument();
    expect(screen.getByText('Last 3h')).toBeInTheDocument();
    expect(screen.getByText('Last 6h')).toBeInTheDocument();
    expect(screen.getByText('Last 12h')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
  });

  it('clicking quick hour sets date range', async () => {
    renderWithProviders(<AnimateTab />);
    const btn = screen.getByText('Last 1h');
    fireEvent.click(btn);
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders generate button', () => {
    renderWithProviders(<AnimateTab />);
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    expect(generateBtn).toBeInTheDocument();
  });

  it('does NOT render mode toggle between quick/studio', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.queryByText('Quick Animate')).not.toBeInTheDocument();
    expect(screen.queryByText('Animation Studio')).not.toBeInTheDocument();
  });

  it('renders quick-start preset chips', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('🌀 Hurricane Watch')).toBeInTheDocument();
    expect(screen.getByText('🌅 Visible Timelapse')).toBeInTheDocument();
    expect(screen.getByText('⚡ Storm Cell')).toBeInTheDocument();
    expect(screen.getByText('🌍 Full Disk')).toBeInTheDocument();
    expect(screen.getByText('🔥 Fire Watch')).toBeInTheDocument();
  });

  it('renders source mode toggle (filters vs collection)', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('By Filters')).toBeInTheDocument();
    expect(screen.getByText('From Collection')).toBeInTheDocument();
  });

  it('switches to collection mode', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('From Collection'));
    expect(screen.getByText('Select collection...')).toBeInTheDocument();
  });

  it('clicking quick-start chip sets config and date range', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('🌀 Hurricane Watch'));
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders animation history section', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Animation History')).toBeInTheDocument();
    expect(screen.getByText(/No animations yet/)).toBeInTheDocument();
  });

  it('renders settings panel on desktop (hidden class for mobile)', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Animation Settings')).toBeInTheDocument();
  });
});
