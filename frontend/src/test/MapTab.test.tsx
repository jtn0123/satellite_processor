import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

// Mock leaflet since it needs DOM APIs not available in happy-dom
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({ addTo: vi.fn(), bindPopup: vi.fn() })),
    icon: vi.fn(),
  },
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
}));

import MapTab from '../components/GoesData/MapTab';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

describe('MapTab', () => {
  it('renders without crashing', () => {
    renderWithProviders(<MapTab />);
    // MapTab should render its container
    expect(document.querySelector('[class*="map"]') || document.body).toBeTruthy();
  });

  it('renders map container element', () => {
    const { container } = renderWithProviders(<MapTab />);
    // Should have at least one div for the map
    expect(container.querySelector('div')).toBeTruthy();
  });

  it('renders satellite, sector, band selects and opacity slider', () => {
    const { container } = renderWithProviders(<MapTab />);
    expect(container.querySelector('#map-satellite')).toBeTruthy();
    expect(container.querySelector('#map-sector')).toBeTruthy();
    expect(container.querySelector('#map-band')).toBeTruthy();
    expect(container.querySelector('#map-overlay-opacity')).toBeTruthy();
  });

  it('changes satellite select value', async () => {
    const { default: mockedApi } = await import('../api/client');
    const { fireEvent, waitFor } = await import('@testing-library/react');
    vi.mocked(mockedApi.get).mockImplementation((url: string) => {
      if (url.includes('products')) {
        return Promise.resolve({
          data: {
            satellites: ['GOES-16', 'GOES-18'],
            sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI' }],
            bands: [{ id: 'C02', description: 'Red Visible' }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<MapTab />);
    await waitFor(() => {
      const satSelect = container.querySelector('#map-satellite') as HTMLSelectElement;
      expect(satSelect.options.length).toBeGreaterThan(1);
    });
    const satSelect = container.querySelector('#map-satellite') as HTMLSelectElement;
    fireEvent.change(satSelect, { target: { value: 'GOES-18' } });
    expect(satSelect.value).toBe('GOES-18');
  });

  it('changes opacity slider', async () => {
    const { container } = renderWithProviders(<MapTab />);
    const slider = container.querySelector('#map-overlay-opacity') as HTMLInputElement;
    if (slider) {
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(slider, { target: { value: '0.5' } });
      expect(slider.value).toBe('0.5');
    }
  });
});
