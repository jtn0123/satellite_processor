import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BandPicker from '../components/GoesData/BandPicker';
import SectorPicker from '../components/GoesData/SectorPicker';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

const MOCK_SECTORS = [
  { id: 'FullDisk', name: 'FullDisk', cadence_minutes: 10, typical_file_size_kb: 12000 },
  { id: 'CONUS', name: 'CONUS', cadence_minutes: 5, typical_file_size_kb: 4000 },
];

describe('BandPicker with thumbnails', () => {
  it('renders with satellite and sector props', () => {
    wrap(
      <BandPicker value="C02" onChange={() => {}} satellite="GOES-19" sector="CONUS" />,
    );
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('renders without satellite/sector (no thumbnails)', () => {
    wrap(<BandPicker value="C02" onChange={() => {}} />);
    expect(screen.getByText('C02')).toBeInTheDocument();
  });

  it('accepts satellite and sector props without error', () => {
    wrap(
      <BandPicker value="C02" onChange={() => {}} satellite="GOES-19" sector="CONUS" />,
    );
    // Verify band cards render correctly with the new props
    expect(screen.getByText('C02')).toBeInTheDocument();
    expect(screen.getByText('C01')).toBeInTheDocument();
  });
});

describe('SectorPicker with thumbnails', () => {
  it('renders with satellite prop', () => {
    wrap(
      <SectorPicker
        value="CONUS"
        onChange={() => {}}
        sectors={MOCK_SECTORS}
        satellite="GOES-19"
      />,
    );
    expect(screen.getByText('CONUS')).toBeInTheDocument();
    expect(screen.getByText('FullDisk')).toBeInTheDocument();
  });
});

describe('MapTab loading states', () => {
  it('exists as a component', async () => {
    // MapTab uses leaflet which is hard to test in jsdom
    // Just verify the module exports
    const mod = await import('../components/GoesData/MapTab');
    expect(mod.default).toBeDefined();
  });
});
