import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InlineFetchProgress from '../components/GoesData/InlineFetchProgress';

describe('InlineFetchProgress', () => {
  it('shows spinner and progress for active job', () => {
    const { container } = render(
      <InlineFetchProgress job={{ id: 'j1', status: 'processing', progress: 45, status_message: 'Downloading band C02' }} />
    );
    expect(screen.getByText('Downloading band C02')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows "Fetching…" when no status_message', () => {
    render(
      <InlineFetchProgress job={{ id: 'j1', status: 'processing', progress: 10, status_message: '' }} />
    );
    expect(screen.getByText('Fetching…')).toBeInTheDocument();
  });

  it('shows success for completed job', () => {
    render(
      <InlineFetchProgress job={{ id: 'j1', status: 'completed', progress: 100, status_message: '' }} />
    );
    expect(screen.getByText('✓ Fetch complete')).toBeInTheDocument();
  });

  it('shows failure for failed job', () => {
    render(
      <InlineFetchProgress job={{ id: 'j1', status: 'failed', progress: 50, status_message: '' }} />
    );
    expect(screen.getByText('✗ Fetch failed')).toBeInTheDocument();
  });

  it('does not show spinner for completed job', () => {
    const { container } = render(
      <InlineFetchProgress job={{ id: 'j1', status: 'completed', progress: 100, status_message: '' }} />
    );
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('progress bar width matches job progress', () => {
    const { container } = render(
      <InlineFetchProgress job={{ id: 'j1', status: 'processing', progress: 75, status_message: 'Working' }} />
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '75%' });
  });
});
