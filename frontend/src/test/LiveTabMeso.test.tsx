import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { isMesoSector } from '../utils/sectorHelpers';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'meso-job-1' } })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isMesoSector helper', () => {
  it('returns true for Mesoscale1', () => {
    expect(isMesoSector('Mesoscale1')).toBe(true);
  });

  it('returns true for Mesoscale2', () => {
    expect(isMesoSector('Mesoscale2')).toBe(true);
  });

  it('returns false for CONUS', () => {
    expect(isMesoSector('CONUS')).toBe(false);
  });

  it('returns false for FullDisk', () => {
    expect(isMesoSector('FullDisk')).toBe(false);
  });
});

describe('LiveTab renders', () => {
  beforeEach(() => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-19'],
            default_satellite: 'GOES-19',
            satellite_availability: {},
            sectors: [
              { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPC', cadence_minutes: 5, cdn_available: true },
              { id: 'Mesoscale1', name: 'Mesoscale 1', product: 'ABI-L2-CMIPM', cadence_minutes: 1, cdn_available: false },
            ],
            bands: [
              { id: 'GEOCOLOR', description: 'GeoColor' },
              { id: 'C02', description: 'Red' },
            ],
          },
        });
      }
      if (url.startsWith('/goes/latest')) {
        return Promise.resolve({
          data: {
            id: 1, satellite: 'GOES-19', sector: 'CONUS', band: 'C02',
            capture_time: '2025-06-01T12:00:00', file_size: 1024, width: 5424, height: 3000,
            image_url: '/api/goes/frames/1/image', thumbnail_url: '/api/goes/frames/1/thumb',
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('renders LiveTab with products including mesoscale sectors', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('live-image-area')).toBeInTheDocument();
    });
    // Verify products API was called (includes meso sectors)
    expect(mockedApi.get).toHaveBeenCalledWith('/goes/products');
  });
});
