import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// StatusPill
import StatusPill from '../components/GoesData/StatusPill';

describe('StatusPill', () => {
  it('renders LIVE state', () => {
    render(<StatusPill monitoring={false} satellite="GOES-16" band="C02" frameTime={null} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('LIVE');
  });

  it('renders MONITORING state', () => {
    render(<StatusPill monitoring={true} satellite="GOES-18" band="C07" frameTime={null} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('MONITORING');
  });

  it('shows satellite and band', () => {
    render(<StatusPill monitoring={false} satellite="GOES-16" band="C13" frameTime={null} />);
    const pill = screen.getByTestId('status-pill');
    expect(pill).toHaveTextContent('GOES-16');
    expect(pill).toHaveTextContent('C13');
  });

  it('shows time ago when frameTime provided', () => {
    const recent = new Date(Date.now() - 120000).toISOString(); // 2 min ago
    render(<StatusPill monitoring={false} satellite="GOES-16" band="C02" frameTime={recent} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent('2 min ago');
  });

  it('uses mobile styling when isMobile', () => {
    render(<StatusPill monitoring={false} satellite="GOES-16" band="C02" frameTime={null} isMobile />);
    const pill = screen.getByTestId('status-pill');
    expect(pill.className).toContain('top-2');
  });
});

// FullscreenButton
import FullscreenButton from '../components/GoesData/FullscreenButton';

describe('FullscreenButton', () => {
  it('renders enter fullscreen button', () => {
    render(<FullscreenButton isFullscreen={false} onClick={vi.fn()} />);
    expect(screen.getByLabelText('Enter fullscreen')).toBeInTheDocument();
  });

  it('renders exit fullscreen button', () => {
    render(<FullscreenButton isFullscreen={true} onClick={vi.fn()} />);
    expect(screen.getByLabelText('Exit fullscreen')).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<FullscreenButton isFullscreen={false} onClick={onClick} />);
    fireEvent.click(screen.getByLabelText('Enter fullscreen'));
    expect(onClick).toHaveBeenCalled();
  });
});

// ImageErrorBoundary
import ImageErrorBoundary from '../components/GoesData/ImageErrorBoundary';

function ThrowingChild(): React.JSX.Element {
  throw new Error('Test error');
}

describe('ImageErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ImageErrorBoundary>
        <div data-testid="child">OK</div>
      </ImageErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders fallback on error', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ImageErrorBoundary>
        <ThrowingChild />
      </ImageErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong loading the image')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('has a Try again button that resets error state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ImageErrorBoundary>
        <ThrowingChild />
      </ImageErrorBoundary>,
    );
    const btn = screen.getByText('Try again');
    expect(btn).toBeInTheDocument();
    // Clicking will reset hasError, but ThrowingChild will throw again
    fireEvent.click(btn);
    // Still shows fallback since child keeps throwing
    expect(screen.getByText('Something went wrong loading the image')).toBeInTheDocument();
    spy.mockRestore();
  });
});

// MobileControlsFab
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

  it('shows Watch button in menu', () => {
    render(<MobileControlsFab {...defaultProps} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByText('Watch')).toBeInTheDocument();
  });

  it('shows Stop Watch when monitoring', () => {
    render(<MobileControlsFab {...defaultProps} monitoring={true} />);
    fireEvent.click(screen.getByTestId('fab-toggle'));
    expect(screen.getByText('Stop Watch')).toBeInTheDocument();
  });
});

// DesktopControlsBar
import DesktopControlsBar from '../components/GoesData/DesktopControlsBar';

describe('DesktopControlsBar', () => {
  const defaultProps = {
    monitoring: false,
    onToggleMonitor: vi.fn(),
    autoFetch: false,
    onAutoFetchChange: vi.fn(),
    refreshInterval: 300000,
    onRefreshIntervalChange: vi.fn(),
    compareMode: false,
    onCompareModeChange: vi.fn(),
  };

  it('renders Watch button', () => {
    render(<DesktopControlsBar {...defaultProps} />);
    expect(screen.getByTestId('watch-toggle-btn')).toBeInTheDocument();
  });

  it('renders auto-fetch toggle', () => {
    render(<DesktopControlsBar {...defaultProps} />);
    expect(screen.getByLabelText('Toggle auto-fetch')).toBeInTheDocument();
  });

  it('calls onToggleMonitor when Watch clicked', () => {
    const onToggleMonitor = vi.fn();
    render(<DesktopControlsBar {...defaultProps} onToggleMonitor={onToggleMonitor} />);
    fireEvent.click(screen.getByTestId('watch-toggle-btn'));
    expect(onToggleMonitor).toHaveBeenCalled();
  });

  it('shows Stop Watch when monitoring', () => {
    render(<DesktopControlsBar {...defaultProps} monitoring={true} />);
    expect(screen.getByText('Stop Watch')).toBeInTheDocument();
  });
});

// liveTabUtils — multi-band cache
import { saveCachedImage, loadCachedImage } from '../components/GoesData/liveTabUtils';

describe('Multi-band offline cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and loads cached image by band', () => {
    saveCachedImage('https://cdn.example.com/img1.jpg', {
      satellite: 'GOES-16', band: 'C02', sector: 'CONUS', timestamp: '2026-01-01T00:00:00Z',
    });
    const result = loadCachedImage('GOES-16', 'CONUS', 'C02');
    expect(result).not.toBeNull();
    expect(result?.url).toBe('https://cdn.example.com/img1.jpg');
    expect(result?.band).toBe('C02');
  });

  it('returns null when no cache exists', () => {
    expect(loadCachedImage('GOES-16', 'CONUS', 'C07')).toBeNull();
  });

  it('returns null when no specific band requested (no cross-band fallback)', () => {
    saveCachedImage('https://cdn.example.com/old.jpg', {
      satellite: 'GOES-16', band: 'C02', sector: 'CONUS', timestamp: '2026-01-01T00:00:00Z',
    });
    saveCachedImage('https://cdn.example.com/new.jpg', {
      satellite: 'GOES-16', band: 'C07', sector: 'CONUS', timestamp: '2026-01-02T00:00:00Z',
    });
    // No params = no result (prevents showing wrong band's image)
    const result = loadCachedImage();
    expect(result).toBeNull();
  });

  it('prunes old entries when over MAX_CACHED limit', () => {
    for (let i = 1; i <= 8; i++) {
      saveCachedImage(`https://cdn.example.com/img${i}.jpg`, {
        satellite: 'GOES-16', band: `C${String(i).padStart(2, '0')}`, sector: 'CONUS',
        timestamp: `2026-01-0${i}T00:00:00Z`,
      });
    }
    // Should have pruned oldest, keeping MAX_CACHED (6)
    const cacheKeys = Object.keys(localStorage).filter(k => k.startsWith('live-cache:'));
    expect(cacheKeys.length).toBeLessThanOrEqual(6);
  });

  it('handles storage errors gracefully', () => {
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };
    // Should not throw
    expect(() => saveCachedImage('url', { satellite: 'X', band: 'Y', sector: 'Z', timestamp: '' })).not.toThrow();
    Storage.prototype.setItem = origSetItem;
  });
});
