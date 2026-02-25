import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BandPillStrip from './BandPillStrip';

const defaultProps = {
  bands: [{ id: 'C02', description: 'Red Visible' }],
  activeBand: 'C02',
  onBandChange: vi.fn(),
  satellite: 'GOES-16',
  sector: 'CONUS',
  satellites: ['GOES-16', 'GOES-18'] as const,
  sectors: [
    { id: 'CONUS', name: 'CONUS' },
    { id: 'FD', name: 'Full Disk' },
    { id: 'MESO1', name: 'MESO1' },
  ] as const,
  onSatelliteChange: vi.fn(),
  onSectorChange: vi.fn(),
  sectorName: 'CONUS',
};

describe('BandPillStrip', () => {
  it('renders collapsed satellite and sector chips by default', () => {
    render(<BandPillStrip {...defaultProps} />);
    expect(screen.getByTestId('pill-strip-satellite')).toHaveTextContent('GOES-16 ▾');
    expect(screen.getByTestId('pill-strip-sector')).toHaveTextContent('CONUS ▾');
  });

  it('clicking satellite chip expands satellite options', () => {
    render(<BandPillStrip {...defaultProps} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    expect(screen.getByTestId('satellite-option-GOES-16')).toHaveTextContent('GOES-16 ✓');
    expect(screen.getByTestId('satellite-option-GOES-18')).toHaveTextContent('GOES-18');
    expect(screen.queryByTestId('pill-strip-satellite')).not.toBeInTheDocument();
  });

  it('clicking a satellite option calls onSatelliteChange and collapses', () => {
    const onSatelliteChange = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteChange={onSatelliteChange} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    fireEvent.click(screen.getByTestId('satellite-option-GOES-18'));
    expect(onSatelliteChange).toHaveBeenCalledWith('GOES-18');
    expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument();
  });

  it('clicking sector chip expands sector options', () => {
    render(<BandPillStrip {...defaultProps} />);
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    expect(screen.getByTestId('sector-option-CONUS')).toHaveTextContent('CONUS ✓');
    expect(screen.getByTestId('sector-option-FD')).toHaveTextContent('Full Disk');
    expect(screen.queryByTestId('pill-strip-sector')).not.toBeInTheDocument();
  });

  it('expanding one group collapses the other', () => {
    render(<BandPillStrip {...defaultProps} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    expect(screen.getByTestId('satellite-option-GOES-16')).toBeInTheDocument();
    // Select a satellite to collapse, then expand sector
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    expect(screen.getByTestId('sector-option-CONUS')).toBeInTheDocument();
    expect(screen.queryByTestId('satellite-option-GOES-16')).not.toBeInTheDocument();
  });

  it('clicking active option just collapses without calling change', () => {
    const onSatelliteChange = vi.fn();
    render(<BandPillStrip {...defaultProps} onSatelliteChange={onSatelliteChange} />);
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    expect(onSatelliteChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument();
  });
});
