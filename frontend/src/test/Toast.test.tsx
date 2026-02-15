import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ToastContainer from '../components/Toast';
import { showToast } from '../utils/toast';

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders nothing when no toasts', () => {
    const { container } = render(<ToastContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a success toast', () => {
    render(<ToastContainer />);
    act(() => { showToast('success', 'Operation complete'); });
    expect(screen.getByText('Operation complete')).toBeInTheDocument();
  });

  it('shows an error toast', () => {
    render(<ToastContainer />);
    act(() => { showToast('error', 'Something failed'); });
    expect(screen.getByText('Something failed')).toBeInTheDocument();
  });

  it('shows a warning toast', () => {
    render(<ToastContainer />);
    act(() => { showToast('warning', 'Watch out'); });
    expect(screen.getByText('Watch out')).toBeInTheDocument();
  });

  it('shows an info toast', () => {
    render(<ToastContainer />);
    act(() => { showToast('info', 'FYI'); });
    expect(screen.getByText('FYI')).toBeInTheDocument();
  });

  it('has dismiss buttons on toasts', () => {
    render(<ToastContainer />);
    act(() => { showToast('success', 'Has dismiss'); });
    expect(screen.getAllByLabelText('Dismiss notification').length).toBeGreaterThan(0);
  });
});
