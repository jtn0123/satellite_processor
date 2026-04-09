import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileControlsFab from '../components/GoesData/MobileControlsFab';

describe('MobileControlsFab', () => {
  const defaultProps = {
    monitoring: false,
    onToggleMonitor: vi.fn(),
    autoFetch: false,
    onAutoFetchChange: vi.fn(),
  };

  it('renders FAB toggle button', () => {
    render(<MobileControlsFab {...defaultProps} />);
    expect(screen.getByTestId('fab-toggle')).toBeInTheDocument();
  });

  it('opens menu on click', () => {
    render(<MobileControlsFab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByTestId('fab-menu')).toBeInTheDocument();
  });

  it('shows Watch button when not monitoring', () => {
    render(<MobileControlsFab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByText('Watch')).toBeInTheDocument();
  });

  it('shows Stop Watch when monitoring', () => {
    render(<MobileControlsFab {...defaultProps} monitoring={true} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByText('Stop Watch')).toBeInTheDocument();
  });

  it('calls onToggleMonitor and closes menu', () => {
    const onToggle = vi.fn();
    render(<MobileControlsFab {...defaultProps} onToggleMonitor={onToggle} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    fireEvent.click(screen.getByText('Watch'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('calls onAutoFetchChange when auto-fetch clicked', () => {
    const onAutoFetch = vi.fn();
    render(<MobileControlsFab {...defaultProps} onAutoFetchChange={onAutoFetch} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    // JTN-428: label is now "Auto-fetch off" / "Auto-fetch on" instead of "Auto-fetch".
    fireEvent.click(screen.getByText('Auto-fetch off'));
    expect(onAutoFetch).toHaveBeenCalledWith(true);
  });

  it('disables auto-fetch when autoFetchDisabled', () => {
    render(
      <MobileControlsFab
        {...defaultProps}
        autoFetchDisabled={true}
        autoFetchDisabledReason="CDN only"
      />,
    );
    fireEvent.click(screen.getByTestId('fab-toggle'));
    // JTN-428: "Auto-fetch N/A" replaced with "Auto-fetch unavailable"
    // + a secondary line showing the real reason.
    expect(screen.getByText('Auto-fetch unavailable')).toBeInTheDocument();
    expect(screen.getByText('CDN only')).toBeInTheDocument();
    expect(screen.getByText('Auto-fetch unavailable').closest('button')).toBeDisabled();
  });

  it('closes menu on second toggle click', () => {
    render(<MobileControlsFab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByTestId('fab-menu')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.queryByTestId('fab-menu')).not.toBeInTheDocument();
  });
});
