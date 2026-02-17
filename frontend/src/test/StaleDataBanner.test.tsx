import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StaleDataBanner from '../components/GoesData/StaleDataBanner';

const freshInfo = { awsAge: '2 min ago', localAge: '2 min ago', behindMin: 0 };
const behindInfo = { awsAge: '2 min ago', localAge: '45 min ago', behindMin: 43 };

function recentTime() {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
}
function amberTime() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hr ago
}
function redTime() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString(); // 3 hr ago
}

describe('StaleDataBanner', () => {
  it('renders nothing when data is fresh and not behind', () => {
    const { container } = render(
      <StaleDataBanner freshnessInfo={freshInfo} captureTime={recentTime()} activeJobId={null} onFetchNow={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows banner when behind even if capture is recent', () => {
    render(
      <StaleDataBanner freshnessInfo={behindInfo} captureTime={recentTime()} activeJobId={null} onFetchNow={() => {}} />
    );
    expect(screen.getByText('Fetch Now')).toBeInTheDocument();
    expect(screen.getByText(/43 min behind/)).toBeInTheDocument();
  });

  it('shows amber warning for 30min-2hr old data', () => {
    render(
      <StaleDataBanner freshnessInfo={freshInfo} captureTime={amberTime()} activeJobId={null} onFetchNow={() => {}} />
    );
    // Should render (amber level, behindMin=0 but staleLevel != green)
    expect(screen.getByText('Fetch Now')).toBeInTheDocument();
  });

  it('shows red warning with "Data is stale!" for >2hr old data', () => {
    render(
      <StaleDataBanner freshnessInfo={behindInfo} captureTime={redTime()} activeJobId={null} onFetchNow={() => {}} />
    );
    expect(screen.getByText('Data is stale!')).toBeInTheDocument();
  });

  it('displays awsAge and localAge text when behind', () => {
    render(
      <StaleDataBanner freshnessInfo={behindInfo} captureTime={amberTime()} activeJobId={null} onFetchNow={() => {}} />
    );
    expect(screen.getByText('2 min ago')).toBeInTheDocument();
    expect(screen.getByText('45 min ago')).toBeInTheDocument();
  });

  it('Fetch Now button calls onFetchNow', () => {
    const fn = vi.fn();
    render(
      <StaleDataBanner freshnessInfo={behindInfo} captureTime={amberTime()} activeJobId={null} onFetchNow={fn} />
    );
    fireEvent.click(screen.getByText('Fetch Now'));
    expect(fn).toHaveBeenCalledOnce();
  });

  it('Fetch Now button is disabled when activeJobId is set', () => {
    render(
      <StaleDataBanner freshnessInfo={behindInfo} captureTime={amberTime()} activeJobId="job-123" onFetchNow={() => {}} />
    );
    expect(screen.getByText('Fetch Now').closest('button')).toBeDisabled();
  });
});
