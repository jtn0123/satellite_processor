import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MesoFetchRequiredMessage from '../components/GoesData/MesoFetchRequiredMessage';

describe('MesoFetchRequiredMessage', () => {
  it('shows generic error when fetchFailed with no errorMessage', () => {
    render(<MesoFetchRequiredMessage onFetchNow={vi.fn()} isFetching={false} fetchFailed={true} errorMessage={null} />);
    const el = screen.getByTestId('meso-fetch-error');
    expect(el.textContent).toBe('No mesoscale data found — try fetching again');
  });

  it('shows specific error message from job status', () => {
    const msg = 'No frames found on S3 for GOES-19 Mesoscale1 C02 between 2026-03-01 17:00 and 2026-03-01 17:10.';
    render(<MesoFetchRequiredMessage onFetchNow={vi.fn()} isFetching={false} fetchFailed={true} errorMessage={msg} />);
    const el = screen.getByTestId('meso-fetch-error');
    expect(el.textContent).toBe(msg);
  });

  it('does not show error when fetchFailed is false', () => {
    render(<MesoFetchRequiredMessage onFetchNow={vi.fn()} isFetching={false} fetchFailed={false} errorMessage={null} />);
    expect(screen.queryByTestId('meso-fetch-error')).toBeNull();
  });

  it('shows loading state when fetching', () => {
    render(<MesoFetchRequiredMessage onFetchNow={vi.fn()} isFetching={true} fetchFailed={false} errorMessage={null} />);
    expect(screen.getByTestId('meso-fetch-loading')).toBeInTheDocument();
  });
});
