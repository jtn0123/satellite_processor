import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BandPillStrip from '../components/GoesData/BandPillStrip';

const mockBands = [
  { id: 'GeoColor', description: 'GeoColor' },
  { id: 'C02', description: 'Red Visible' },
  { id: 'C07', description: 'Shortwave Window' },
  { id: 'C13', description: 'Clean Longwave Window' },
];

const defaultProps = {
  bands: mockBands,
  activeBand: 'C02',
  onBandChange: vi.fn(),
  satellite: 'GOES-16',
  sector: 'CONUS',
  onSatelliteClick: vi.fn(),
  sectorName: 'CONUS',
} as const;

describe('BandPillStrip', () => {
  it('renders all bands as pills', () => {
    render(<BandPillStrip {...defaultProps} />);
    for (const b of mockBands) {
      expect(screen.getByTestId(`band-pill-${b.id}`)).toBeInTheDocument();
    }
  });

  it('active band has correct styling', () => {
    render(<BandPillStrip {...defaultProps} />);
    const activePill = screen.getByTestId('band-pill-C02');
    expect(activePill.className).toContain('bg-primary/20');
    expect(activePill.className).toContain('font-semibold');
  });

  it('inactive band has inactive styling', () => {
    render(<BandPillStrip {...defaultProps} />);
    const inactivePill = screen.getByTestId('band-pill-C07');
    expect(inactivePill.className).toContain('bg-white/10');
    expect(inactivePill.className).not.toContain('font-semibold');
  });

  it('clicking a pill calls onBandChange', () => {
    const onBandChange = vi.fn();
    render(<BandPillStrip {...defaultProps} onBandChange={onBandChange} />);
    fireEvent.click(screen.getByTestId('band-pill-C13'));
    expect(onBandChange).toHaveBeenCalledWith('C13');
  });

  it('satellite chip is tappable and calls onSatelliteClick', () => {
    const onSatelliteClick = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteClick={onSatelliteClick} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    expect(onSatelliteClick).toHaveBeenCalled();
  });

  it('sector chip is tappable and calls onSatelliteClick', () => {
    const onSatelliteClick = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteClick={onSatelliteClick} />);
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    expect(onSatelliteClick).toHaveBeenCalled();
  });

  it('shows satellite status when not operational', () => {
    render(
      <BandPillStrip
        {...defaultProps}
        satelliteAvailability={{ 'GOES-16': { status: 'degraded', description: 'Degraded performance' } }}
      />,
    );
    expect(screen.getByTestId('pill-strip-satellite').textContent).toContain('degraded');
  });

  it('displays sector name when provided', () => {
    render(<BandPillStrip {...defaultProps} sectorName="Full Disk" />);
    expect(screen.getByTestId('pill-strip-sector').textContent).toContain('Full Disk');
  });
});
