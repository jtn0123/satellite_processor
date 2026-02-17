import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InlineFetchProgress from '../components/GoesData/InlineFetchProgress';

describe('InlineFetchProgress', () => {
  it('shows progress bar with correct percentage', () => {
    render(<InlineFetchProgress job={{ id: '1', status: 'running', progress: 42, status_message: 'Downloading...' }} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('displays status message', () => {
    render(<InlineFetchProgress job={{ id: '1', status: 'running', progress: 30, status_message: 'Processing tiles...' }} />);
    expect(screen.getByText('Processing tiles...')).toBeInTheDocument();
  });

  it('shows "Fetching…" when no status_message', () => {
    render(<InlineFetchProgress job={{ id: '1', status: 'running', progress: 0, status_message: '' }} />);
    expect(screen.getByText('Fetching…')).toBeInTheDocument();
  });

  it('shows complete state', () => {
    render(<InlineFetchProgress job={{ id: '1', status: 'completed', progress: 100, status_message: '' }} />);
    expect(screen.getByText('✓ Fetch complete')).toBeInTheDocument();
  });

  it('shows failed state', () => {
    render(<InlineFetchProgress job={{ id: '1', status: 'failed', progress: 50, status_message: 'Error' }} />);
    expect(screen.getByText('✗ Fetch failed')).toBeInTheDocument();
  });

  it('renders progress bar width matching progress', () => {
    const { container } = render(
      <InlineFetchProgress job={{ id: '1', status: 'running', progress: 65, status_message: 'Working...' }} />
    );
    const bar = container.querySelector('[style*="width: 65%"]');
    expect(bar).toBeTruthy();
  });
});
