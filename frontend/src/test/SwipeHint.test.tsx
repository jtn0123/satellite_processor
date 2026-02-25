import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SwipeHint from '../components/GoesData/SwipeHint';

describe('SwipeHint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows chevrons on first visit', () => {
    render(<SwipeHint />);
    expect(screen.getByTestId('swipe-hint-left')).toBeInTheDocument();
    expect(screen.getByTestId('swipe-hint-right')).toBeInTheDocument();
  });

  it('hides after 3.5 seconds and sets localStorage', () => {
    render(<SwipeHint />);
    expect(screen.getByTestId('swipe-hint-left')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(3600); });

    expect(screen.queryByTestId('swipe-hint-left')).not.toBeInTheDocument();
    expect(localStorage.getItem('liveSwipeHintSeen')).toBe('1');
  });

  it('does not show if localStorage key is already set', () => {
    localStorage.setItem('liveSwipeHintSeen', '1');
    render(<SwipeHint />);
    expect(screen.queryByTestId('swipe-hint-left')).not.toBeInTheDocument();
  });
});
