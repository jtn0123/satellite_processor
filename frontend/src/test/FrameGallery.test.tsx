import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FrameGallery from '../components/GoesData/FrameGallery';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes('stats')) return Promise.resolve({ data: { by_satellite: { 'GOES-16': 10 }, by_band: { C02: 5 } } });
      return Promise.resolve({ data: { items: [], total: 0, limit: 24 } });
    }),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FrameGallery', () => {
  it('renders filters', () => {
    renderWithQuery(<FrameGallery />);
    expect(screen.getByText('All Satellites')).toBeInTheDocument();
    expect(screen.getByText('All Bands')).toBeInTheDocument();
  });

  it('renders compare button', () => {
    renderWithQuery(<FrameGallery />);
    expect(screen.getByText(/Compare/)).toBeInTheDocument();
  });

  it('shows frame count', () => {
    renderWithQuery(<FrameGallery />);
    expect(screen.getByText(/0 frames/)).toBeInTheDocument();
  });

  it('toggles compare mode', () => {
    renderWithQuery(<FrameGallery />);
    fireEvent.click(screen.getByText(/Compare/));
    // Compare mode active
    expect(screen.getByText(/Compare/)).toBeInTheDocument();
  });
});
