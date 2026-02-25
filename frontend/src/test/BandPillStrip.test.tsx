import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BandPillStrip from '../components/GoesData/BandPillStrip';

const mockBands = [
  { id: 'GeoColor', description: 'GeoColor' },
  { id: 'C02', description: 'Red Visible' },
  { id: 'C07', description: 'Shortwave Window' },
  { id: 'C13', description: 'Clean Longwave Window' },
];

const mockSatellites = ['GOES-16', 'GOES-18'];
const mockSectors = [
  { id: 'CONUS', name: 'CONUS' },
  { id: 'FD', name: 'Full Disk' },
  { id: 'MESO1', name: 'Mesoscale 1' },
];

const defaultProps = {
  bands: mockBands,
  activeBand: 'C02',
  onBandChange: vi.fn(),
  satellite: 'GOES-16',
  sector: 'CONUS',
  satellites: mockSatellites,
  sectors: mockSectors,
  onSatelliteChange: vi.fn(),
  onSectorChange: vi.fn(),
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

  it('clicking satellite chip expands satellite options', () => {
    render(<BandPillStrip {...defaultProps} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    // After expanding, should see GOES-18 as an option
    expect(screen.getByText('GOES-18')).toBeInTheDocument();
  });

  it('selecting a satellite calls onSatelliteChange and collapses', () => {
    const onSatelliteChange = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteChange={onSatelliteChange} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    fireEvent.click(screen.getByText('GOES-18'));
    expect(onSatelliteChange).toHaveBeenCalledWith('GOES-18');
  });

  it('clicking sector chip expands sector options', () => {
    render(<BandPillStrip {...defaultProps} />);
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    expect(screen.getByText('Full Disk')).toBeInTheDocument();
    expect(screen.getByText('Mesoscale 1')).toBeInTheDocument();
  });

  it('expanding one group collapses when toggled', () => {
    render(<BandPillStrip {...defaultProps} />);
    // Expand satellite
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    expect(screen.getByText('GOES-18')).toBeInTheDocument();
    // Click active satellite to collapse back to default
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    // Now both chips should be visible again
    expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument();
    expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument();
    // Now expand sector
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    expect(screen.getByText('Full Disk')).toBeInTheDocument();
  });

  it('clicking active satellite option just collapses', () => {
    const onSatelliteChange = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteChange={onSatelliteChange} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    // Click the already-active satellite (shown with checkmark)
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    expect(onSatelliteChange).not.toHaveBeenCalled();
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
