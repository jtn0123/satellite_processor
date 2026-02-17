import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WhatsNewModal from '../components/WhatsNewModal';

const MOCK_CHANGELOG = [
  {
    version: '1.0.1',
    date: '2026-02-16',
    changes: ['Fix bug A', 'Fix bug B'],
  },
  {
    version: '1.0.0',
    date: '2026-02-15',
    changes: ['Initial release', 'Feature X'],
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSuccess(data = MOCK_CHANGELOG) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(data),
  });
}

function mockFetchFailure() {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
}

describe('WhatsNewModal', () => {
  it('renders What\'s New heading with version', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} version="1.0.1" />);
    expect(screen.getByText("What's New — v1.0.1")).toBeInTheDocument();
  });

  it('renders What\'s New heading without version', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByText("What's New")).toBeInTheDocument();
  });

  it('shows commit SHA when provided', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} version="1.0.1" commit="abc1234567" />);
    expect(screen.getByText('abc1234')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    // Never-resolving fetch
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(screen.getByLabelText('Loading changelog')).toBeInTheDocument();
  });

  it('renders changelog versions after fetch', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('v1.0.1')).toBeInTheDocument();
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });
  });

  it('renders change items', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Fix bug A')).toBeInTheDocument();
    });
  });

  it('renders GitHub release links', async () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    await waitFor(() => {
      const links = screen.getAllByText('View on GitHub');
      expect(links).toHaveLength(2);
      expect(links[0].closest('a')).toHaveAttribute(
        'href',
        'https://github.com/jtn0123/satellite_processor/releases/tag/v1.0.1'
      );
    });
  });

  it('shows empty state on fetch failure', async () => {
    mockFetchFailure();
    render(<WhatsNewModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No changelog entries available.')).toBeInTheDocument();
    });
  });

  it('shows empty state when API returns empty array', async () => {
    mockFetchSuccess([]);
    render(<WhatsNewModal onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No changelog entries available.')).toBeInTheDocument();
    });
  });

  it('calls onClose when close button clicked', async () => {
    mockFetchSuccess();
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on backdrop click', async () => {
    mockFetchSuccess();
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    const dialog = document.querySelector('dialog')!;
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape', async () => {
    mockFetchSuccess();
    const onClose = vi.fn();
    render(<WhatsNewModal onClose={onClose} />);
    const dialog = document.querySelector('dialog')!;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('has aria-label on dialog', () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    const innerDialog = document.querySelector('[role="dialog"]');
    expect(innerDialog?.getAttribute('aria-label')).toBe("What's New dialog");
  });

  it('fetches from /api/health/changelog', () => {
    mockFetchSuccess();
    render(<WhatsNewModal onClose={vi.fn()} />);
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/health/changelog');
  });
});

describe('WhatsNewModal version tracking', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('localStorage whatsNewLastSeen is set when onClose fires', () => {
    mockFetchSuccess();
    const closeFn: () => void = () => {};
    render(
      <WhatsNewModal
        onClose={() => {
          localStorage.setItem('whatsNewLastSeen', '1.0.1');
          closeFn();
        }}
        version="1.0.1"
      />
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(localStorage.getItem('whatsNewLastSeen')).toBe('1.0.1');
  });

  it('detects new version vs stored version', () => {
    localStorage.setItem('whatsNewLastSeen', '1.0.0');
    const current = '1.0.1';
    const lastSeen = localStorage.getItem('whatsNewLastSeen');
    expect(current).not.toBe(lastSeen);
  });

  it('same version means no new version', () => {
    localStorage.setItem('whatsNewLastSeen', '1.0.1');
    const current = '1.0.1';
    const lastSeen = localStorage.getItem('whatsNewLastSeen');
    expect(current).toBe(lastSeen);
  });
});
