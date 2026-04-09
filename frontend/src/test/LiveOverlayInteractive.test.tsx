import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * JTN-408 ISSUE-011 / 012: the Monitor Settings popover lives inside the
 * auto-hiding controls overlay. Two bugs this covers:
 *
 *   - ISSUE-011: the overlay must stay clickable (no pointer-events:none).
 *   - ISSUE-012: when the popover opens, its internal form must mirror the
 *     live viewer state, not the stale satellite it was initialized with
 *     when the component first mounted. Before the fix the combobox
 *     defaulted to "GOES-16" even when the viewer was showing GOES-19.
 */

vi.mock('../hooks/useMonitorWebSocket', () => ({
  useMonitorWebSocket: vi.fn(() => ({ connected: false, lastEvent: null })),
}));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import MonitorSettingsPanel from '../components/GoesData/MonitorSettingsPanel';

const baseProps = {
  isMonitoring: false,
  interval: 300000,
  satellite: 'GOES-19',
  sector: 'CONUS',
  band: 'GEOCOLOR',
  onStart: vi.fn(),
  onStop: vi.fn(),
  onApplyPreset: vi.fn(),
  satellites: ['GOES-16', 'GOES-18', 'GOES-19', 'Himawari-9'],
  sectors: [
    { id: 'CONUS', name: 'CONUS' },
    { id: 'FULL', name: 'Full Disk' },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor' },
    { id: 'C02', description: 'Visible' },
  ],
};

describe('MonitorSettingsPanel — JTN-408 sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes the satellite combobox from the live viewer state on open', () => {
    render(<MonitorSettingsPanel {...baseProps} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    const satelliteSelect = screen.getByLabelText('Monitor satellite') as HTMLSelectElement;
    expect(satelliteSelect.value).toBe('GOES-19');
  });

  it('re-syncs the form when the viewer satellite changes while the popover was closed', () => {
    const { rerender } = render(<MonitorSettingsPanel {...baseProps} satellite="GOES-19" />);
    // Parent swaps the viewer to Himawari-9 while the popover is closed.
    rerender(<MonitorSettingsPanel {...baseProps} satellite="Himawari-9" />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    const satelliteSelect = screen.getByLabelText('Monitor satellite') as HTMLSelectElement;
    expect(satelliteSelect.value).toBe('Himawari-9');
  });

  it('passes the current viewer state (not a stale prop) to onStart', () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <MonitorSettingsPanel {...baseProps} satellite="GOES-16" onStart={onStart} />,
    );
    // User navigates the live viewer to GOES-19 and then opens the popover.
    rerender(<MonitorSettingsPanel {...baseProps} satellite="GOES-19" onStart={onStart} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    fireEvent.click(screen.getByTestId('monitor-start-btn'));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ satellite: 'GOES-19', sector: 'CONUS', band: 'GEOCOLOR' }),
    );
  });
});
