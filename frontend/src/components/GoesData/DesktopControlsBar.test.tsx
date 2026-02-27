import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesktopControlsBar from './DesktopControlsBar';

const defaultProps = {
  monitoring: false,
  onToggleMonitor: vi.fn(),
  autoFetch: false,
  onAutoFetchChange: vi.fn(),
  refreshInterval: 300000,
  onRefreshIntervalChange: vi.fn(),
  compareMode: false,
  onCompareModeChange: vi.fn(),
} as const;

describe('DesktopControlsBar', () => {
  it('renders Watch button', () => {
    render(<DesktopControlsBar {...defaultProps} />);
    expect(screen.getByTestId('watch-toggle-btn')).toHaveTextContent('Watch');
  });

  it('shows Stop Watch when monitoring', () => {
    render(<DesktopControlsBar {...defaultProps} monitoring={true} />);
    expect(screen.getByTestId('watch-toggle-btn')).toHaveTextContent('Stop Watch');
  });

  it('calls onToggleMonitor when Watch is clicked', async () => {
    const onToggleMonitor = vi.fn();
    render(<DesktopControlsBar {...defaultProps} onToggleMonitor={onToggleMonitor} />);
    await userEvent.click(screen.getByTestId('watch-toggle-btn'));
    expect(onToggleMonitor).toHaveBeenCalledOnce();
  });

  it('calls onAutoFetchChange when toggle is clicked', async () => {
    const onAutoFetchChange = vi.fn();
    render(<DesktopControlsBar {...defaultProps} onAutoFetchChange={onAutoFetchChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /auto-fetch/i }));
    expect(onAutoFetchChange).toHaveBeenCalledWith(true);
  });

  it('does not call onAutoFetchChange when disabled', async () => {
    const onAutoFetchChange = vi.fn();
    render(<DesktopControlsBar {...defaultProps} onAutoFetchChange={onAutoFetchChange} autoFetchDisabled={true} />);
    await userEvent.click(screen.getByRole('switch', { name: /auto-fetch/i }));
    expect(onAutoFetchChange).not.toHaveBeenCalled();
  });

  it('disables interval select when autoFetch is off', () => {
    render(<DesktopControlsBar {...defaultProps} autoFetch={false} />);
    expect(screen.getByLabelText('Auto-fetch interval')).toBeDisabled();
  });

  it('enables interval select when autoFetch is on', () => {
    render(<DesktopControlsBar {...defaultProps} autoFetch={true} />);
    expect(screen.getByLabelText('Auto-fetch interval')).not.toBeDisabled();
  });
});
