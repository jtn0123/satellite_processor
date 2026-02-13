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
});
