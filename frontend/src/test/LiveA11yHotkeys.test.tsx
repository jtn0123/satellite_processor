import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BandPillStrip from '../components/GoesData/BandPillStrip';

vi.mock('../api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: {} }) },
}));

function renderBandStrip() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const bands = [
    { id: 'GEOCOLOR', description: 'GeoColor' },
    { id: 'C02', description: 'Band 2 - Red Visible' },
    { id: 'C13', description: 'Band 13 - Clean IR' },
  ];
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BandPillStrip
          bands={bands}
          activeBand="GEOCOLOR"
          onBandChange={vi.fn()}
          satellite="GOES-19"
          sector="CONUS"
          satellites={['GOES-19', 'GOES-18']}
          sectors={[{ id: 'CONUS', name: 'CONUS' }]}
          onSatelliteChange={vi.fn()}
          onSectorChange={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('BandPillStrip accessibility', () => {
  it('band pills have aria-label', () => {
    renderBandStrip();
    const pills = screen.getAllByTestId(/^band-pill-(?!strip)/);
    for (const pill of pills) {
      expect(pill.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('active band pill has aria-pressed=true', () => {
    renderBandStrip();
    const active = screen.getByTestId('band-pill-GEOCOLOR');
    expect(active.getAttribute('aria-pressed')).toBe('true');
  });

  it('inactive band pill has aria-pressed=false', () => {
    renderBandStrip();
    const inactive = screen.getByTestId('band-pill-C02');
    expect(inactive.getAttribute('aria-pressed')).toBe('false');
  });

  it('active band aria-label includes "(active)"', () => {
    renderBandStrip();
    const active = screen.getByTestId('band-pill-GEOCOLOR');
    expect(active.getAttribute('aria-label')).toContain('(active)');
  });
});
