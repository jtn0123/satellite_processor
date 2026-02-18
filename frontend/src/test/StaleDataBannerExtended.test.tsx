import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StaleDataBanner from '../components/GoesData/StaleDataBanner';

const recentTime = new Date().toISOString();
const staleTime = new Date(Date.now() - 3600000).toISOString(); // 1hr ago (amber)
const veryStaleTime = new Date(Date.now() - 8000000).toISOString(); // >2hr ago (red)

const baseFreshness = { awsAge: '5 min ago', localAge: '30 min ago', behindMin: 25 };

describe('StaleDataBanner', () => {
  it('returns null when data is fresh and not behind', () => {
    const { container } = render(
      <StaleDataBanner
        freshnessInfo={{ awsAge: '2 min ago', localAge: '2 min ago', behindMin: 0 }}
        captureTime={recentTime}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows banner when behind even if recently captured', () => {
    render(
      <StaleDataBanner
        freshnessInfo={{ ...baseFreshness, behindMin: 10 }}
        captureTime={recentTime}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(screen.getByText(/10 min behind/)).toBeInTheDocument();
  });

  it('shows amber styling for 30min+ stale data', () => {
    const { container } = render(
      <StaleDataBanner
        freshnessInfo={baseFreshness}
        captureTime={staleTime}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(container.querySelector('.bg-amber-500\\/10')).toBeInTheDocument();
  });

  it('shows red styling and "Data is stale!" for 2hr+ old data', () => {
    render(
      <StaleDataBanner
        freshnessInfo={baseFreshness}
        captureTime={veryStaleTime}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(screen.getByText('Data is stale!')).toBeInTheDocument();
  });

  it('calls onFetchNow when Fetch Now clicked', () => {
    const onFetchNow = vi.fn();
    render(
      <StaleDataBanner
        freshnessInfo={baseFreshness}
        captureTime={staleTime}
        activeJobId={null}
        onFetchNow={onFetchNow}
      />
    );
    fireEvent.click(screen.getByText('Fetch Now'));
    expect(onFetchNow).toHaveBeenCalledOnce();
  });

  it('disables Fetch Now when activeJobId exists', () => {
    render(
      <StaleDataBanner
        freshnessInfo={baseFreshness}
        captureTime={staleTime}
        activeJobId="job-123"
        onFetchNow={vi.fn()}
      />
    );
    expect(screen.getByText('Fetch Now').closest('button')).toBeDisabled();
  });

  it('shows local age when not behind', () => {
    render(
      <StaleDataBanner
        freshnessInfo={{ awsAge: '5 min ago', localAge: '35 min ago', behindMin: 0 }}
        captureTime={staleTime}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(screen.getByText('35 min ago')).toBeInTheDocument();
  });
});
