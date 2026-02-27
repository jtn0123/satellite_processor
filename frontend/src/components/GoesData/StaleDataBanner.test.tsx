import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaleDataBanner from './StaleDataBanner';

describe('StaleDataBanner', () => {
  const defaultProps = {
    freshnessInfo: { awsAge: '5m ago', localAge: '15m ago', behindMin: 10 },
    captureTime: new Date(Date.now() - 2_400_000).toISOString(), // 40 min ago → amber
    activeJobId: null,
    onFetchNow: vi.fn(),
  } as const;

  it('renders warning with behind info', () => {
    render(<StaleDataBanner {...defaultProps} />);
    expect(screen.getByText(/10 min behind/)).toBeInTheDocument();
    expect(screen.getByText('Fetch Now')).toBeInTheDocument();
  });

  it('calls onFetchNow when Fetch Now is clicked', async () => {
    const onFetchNow = vi.fn();
    render(<StaleDataBanner {...defaultProps} onFetchNow={onFetchNow} />);
    await userEvent.click(screen.getByText('Fetch Now'));
    expect(onFetchNow).toHaveBeenCalledOnce();
  });

  it('disables Fetch Now button when activeJobId is set', () => {
    render(<StaleDataBanner {...defaultProps} activeJobId="job-123" />);
    expect(screen.getByText('Fetch Now').closest('button')).toBeDisabled();
  });

  it('returns null when data is fresh and not behind', () => {
    const { container } = render(
      <StaleDataBanner
        freshnessInfo={{ awsAge: '1m ago', localAge: '1m ago', behindMin: 0 }}
        captureTime={new Date(Date.now() - 60_000).toISOString()}
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows stale warning for very old data', () => {
    render(
      <StaleDataBanner
        freshnessInfo={{ awsAge: '10m ago', localAge: '3h ago', behindMin: 170 }}
        captureTime={new Date(Date.now() - 10_800_000).toISOString()} // 3h ago → red
        activeJobId={null}
        onFetchNow={vi.fn()}
      />
    );
    expect(screen.getByText(/Data is stale!/)).toBeInTheDocument();
  });
});
