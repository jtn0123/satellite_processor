import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../hooks/useMonitorWebSocket', () => ({
  useMonitorWebSocket: vi.fn(() => ({ connected: false, lastEvent: null })),
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import MonitorSettingsPanel, { MONITOR_PRESETS } from '../components/GoesData/MonitorSettingsPanel';

const defaultProps = {
  isMonitoring: false,
  interval: 300000,
  satellite: 'GOES-16',
  sector: 'CONUS',
  band: 'C02',
  onStart: vi.fn(),
  onStop: vi.fn(),
  onApplyPreset: vi.fn(),
  satellites: ['GOES-16', 'GOES-18'],
  sectors: [{ id: 'CONUS', name: 'CONUS' }, { id: 'FULL', name: 'Full Disk' }],
  bands: [{ id: 'C02', description: 'Visible' }],
};

describe('MonitorSettingsPanel', () => {
  it('renders settings button', () => {
    render(<MonitorSettingsPanel {...defaultProps} />);
    expect(screen.getByLabelText('Monitor settings')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<MonitorSettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    expect(screen.getByTestId('monitor-settings-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Monitor Settings')).toBeInTheDocument();
  });

  it('shows presets', () => {
    render(<MonitorSettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    MONITOR_PRESETS.forEach((preset) => {
      expect(screen.getByText(preset.label)).toBeInTheDocument();
    });
  });

  it('calls onApplyPreset when preset clicked', () => {
    const onApplyPreset = vi.fn();
    render(<MonitorSettingsPanel {...defaultProps} onApplyPreset={onApplyPreset} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    fireEvent.click(screen.getByText(MONITOR_PRESETS[0].label));
    expect(onApplyPreset).toHaveBeenCalledWith(MONITOR_PRESETS[0]);
  });

  it('shows start button when not monitoring', () => {
    render(<MonitorSettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    expect(screen.getByTestId('monitor-start-btn')).toBeInTheDocument();
  });

  it('shows stop button when monitoring', () => {
    render(<MonitorSettingsPanel {...defaultProps} isMonitoring={true} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    expect(screen.getByTestId('monitor-stop-btn')).toBeInTheDocument();
  });

  it('calls onStart with config', () => {
    const onStart = vi.fn();
    render(<MonitorSettingsPanel {...defaultProps} onStart={onStart} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    fireEvent.click(screen.getByTestId('monitor-start-btn'));
    expect(onStart).toHaveBeenCalledWith({
      satellite: 'GOES-16',
      sector: 'CONUS',
      band: 'C02',
      interval: 300000,
    });
  });

  it('calls onStop when stop clicked', () => {
    const onStop = vi.fn();
    render(<MonitorSettingsPanel {...defaultProps} isMonitoring={true} onStop={onStop} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    fireEvent.click(screen.getByTestId('monitor-stop-btn'));
    expect(onStop).toHaveBeenCalled();
  });

  it('shows active indicator when monitoring', () => {
    render(<MonitorSettingsPanel {...defaultProps} isMonitoring={true} />);
    fireEvent.click(screen.getByLabelText('Monitor settings'));
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('MONITOR_PRESETS', () => {
  it('has expected presets', () => {
    expect(MONITOR_PRESETS).toHaveLength(3);
    expect(MONITOR_PRESETS[0].sector).toBe('CONUS');
    expect(MONITOR_PRESETS[1].sector).toBe('FULL');
    expect(MONITOR_PRESETS[2].sector).toBe('M1');
  });
});
