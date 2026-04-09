/**
 * JTN-387: Unit tests for the pieces extracted out of LiveTab.tsx /
 * LiveImageArea.tsx during the split. These run as cheap RTL/hook tests
 * that don't need the full LiveTab query graph.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen } from '@testing-library/react';
import { useLiveOverlay } from '../components/GoesData/LiveTab/useLiveOverlay';
import { useComparisonPanel } from '../components/GoesData/LiveTab/useComparisonPanel';
import { BandSelector } from '../components/GoesData/LiveTab/BandSelector';

describe('useComparisonPanel', () => {
  it('initializes with compareMode=false and position=50', () => {
    const { result } = renderHook(() => useComparisonPanel());
    expect(result.current.compareMode).toBe(false);
    expect(result.current.comparePosition).toBe(50);
  });

  it('toggles compareMode', () => {
    const { result } = renderHook(() => useComparisonPanel());
    act(() => result.current.setCompareMode(true));
    expect(result.current.compareMode).toBe(true);
    act(() => result.current.setCompareMode((v) => !v));
    expect(result.current.compareMode).toBe(false);
  });

  it('updates slider position', () => {
    const { result } = renderHook(() => useComparisonPanel());
    act(() => result.current.setComparePosition(25));
    expect(result.current.comparePosition).toBe(25);
  });
});

describe('useLiveOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts visible on desktop and stays visible', () => {
    const { result } = renderHook(() => useLiveOverlay(false));
    expect(result.current.overlayVisible).toBe(true);

    act(() => {
      result.current.resetOverlayTimer();
    });
    // Advance well past any possible auto-hide
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.overlayVisible).toBe(true);
  });

  it('auto-hides on mobile after 5s and toggles back on', () => {
    const { result } = renderHook(() => useLiveOverlay(true));
    expect(result.current.overlayVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.overlayVisible).toBe(false);

    act(() => {
      result.current.toggleOverlay();
    });
    expect(result.current.overlayVisible).toBe(true);
  });

  it('toggleOverlay is a no-op on desktop (stays visible)', () => {
    const { result } = renderHook(() => useLiveOverlay(false));
    act(() => {
      result.current.toggleOverlay();
    });
    expect(result.current.overlayVisible).toBe(true);
  });
});

describe('BandSelector', () => {
  const baseProps = {
    satellite: 'GOES-16',
    sector: 'CONUS',
    band: 'C02',
    onSatelliteChange: vi.fn(),
    onSectorChange: vi.fn(),
    onBandChange: vi.fn(),
    allSatellites: ['GOES-16', 'GOES-18'] as const,
    satelliteSectors: [
      { id: 'CONUS', name: 'CONUS' },
      { id: 'FullDisk', name: 'Full Disk' },
    ] as const,
    satelliteBands: [
      { id: 'C02', description: 'Visible Red' },
      { id: 'GEOCOLOR', description: 'GeoColor' },
    ] as const,
    disabledBands: [] as const,
  };

  it('renders the band pill strip for the mobile variant', () => {
    render(<BandSelector variant="mobile" {...baseProps} />);
    expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
  });

  it('renders the band pill strip for the desktop variant', () => {
    render(<BandSelector variant="desktop" {...baseProps} />);
    expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
  });

  it('surfaces satellite + sector chips', () => {
    render(<BandSelector variant="mobile" {...baseProps} />);
    expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument();
    expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument();
  });
});
