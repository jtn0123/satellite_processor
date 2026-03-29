import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from '../hooks/usePageTitle';

describe('usePageTitle', () => {
  const originalTitle = 'Original Title';

  beforeEach(() => {
    document.title = originalTitle;
  });

  it('sets document title with suffix', () => {
    renderHook(() => usePageTitle('Dashboard'));
    expect(document.title).toBe('Dashboard — SatTracker');
  });

  it('restores previous title on unmount', () => {
    const { unmount } = renderHook(() => usePageTitle('Settings'));
    expect(document.title).toBe('Settings — SatTracker');

    unmount();
    expect(document.title).toBe(originalTitle);
  });

  it('updates when title prop changes', () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Page A' },
    });
    expect(document.title).toBe('Page A — SatTracker');

    rerender({ title: 'Page B' });
    expect(document.title).toBe('Page B — SatTracker');
  });
});
