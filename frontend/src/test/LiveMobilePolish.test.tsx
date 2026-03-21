import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithRouter } from './testUtils';
import LiveTab from '../components/GoesData/LiveTab';

const renderWithProviders = renderWithRouter;

function setMobileViewport() {
  Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
  window.dispatchEvent(new Event('resize'));
}

function setDesktopViewport() {
  Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  window.dispatchEvent(new Event('resize'));
}

describe('Mobile Live View Polish', () => {
  beforeEach(() => {
    vi.useRealTimers();
    setMobileViewport();
  });

  afterEach(() => {
    setDesktopViewport();
    document.body.style.overflow = '';
  });

  it('scroll lock: sets overflow hidden on body on mount and removes on unmount', async () => {
    const { unmount } = renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('hidden');
    });

    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('status pill renders inside the live image area container', async () => {
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('status-pill')).toBeInTheDocument();
    });

    const pill = screen.getByTestId('status-pill');
    const imageArea = screen.getByTestId('live-image-area');
    expect(imageArea.contains(pill)).toBe(true);
  });

  it('FAB has no text label on mobile', async () => {
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('mobile-fab')).toBeInTheDocument();
    });

    expect(screen.queryByText('Controls')).not.toBeInTheDocument();
  });
});
