import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import DevErrorOverlay from '../components/DevErrorOverlay';
import * as errorReporter from '../utils/errorReporter';

describe('DevErrorOverlay', () => {
  beforeEach(() => {
    errorReporter.clearErrorLog();
  });

  it('renders the bug badge button', () => {
    render(<DevErrorOverlay />);
    expect(screen.getByTitle('Error log')).toBeInTheDocument();
  });

  it('opens panel on badge click', () => {
    render(<DevErrorOverlay />);
    fireEvent.click(screen.getByTitle('Error log'));
    expect(screen.getByText('Errors (0)')).toBeInTheDocument();
    expect(screen.getByText('No errors captured')).toBeInTheDocument();
  });

  it('closes panel on close button click', () => {
    render(<DevErrorOverlay />);
    fireEvent.click(screen.getByTitle('Error log'));
    expect(screen.getByText('Errors (0)')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Close'));
    expect(screen.queryByText('Errors (0)')).not.toBeInTheDocument();
  });

  it('shows error count badge when errors are reported', () => {
    let triggerError: ((report: errorReporter.ErrorReport) => void) | undefined;
    vi.spyOn(errorReporter, 'onError').mockImplementation((fn) => {
      triggerError = fn;
      return () => {};
    });

    render(<DevErrorOverlay />);

    act(() => {
      triggerError?.({
        message: 'test error',
        context: 'TestCtx',
        timestamp: new Date().toISOString(),
      });
    });

    // The count badge should show "1"
    expect(screen.getByText('1')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('displays errors in the panel when opened after reporting', () => {
    vi.spyOn(errorReporter, 'getErrorLog').mockReturnValue([
      {
        message: 'visible error',
        context: 'VisCtx',
        timestamp: '2025-01-01T00:00:00Z',
      },
    ]);

    let triggerError: ((report: errorReporter.ErrorReport) => void) | undefined;
    vi.spyOn(errorReporter, 'onError').mockImplementation((fn) => {
      triggerError = fn;
      return () => {};
    });

    render(<DevErrorOverlay />);

    act(() => {
      triggerError?.({
        message: 'visible error',
        context: 'VisCtx',
        timestamp: '2025-01-01T00:00:00Z',
      });
    });

    fireEvent.click(screen.getByTitle('Error log'));
    expect(screen.getByText('visible error')).toBeInTheDocument();
    expect(screen.getByText('VisCtx')).toBeInTheDocument();

    vi.restoreAllMocks();
  });

  it('clears errors on clear button click', () => {
    const clearSpy = vi.spyOn(errorReporter, 'clearErrorLog');

    render(<DevErrorOverlay />);
    fireEvent.click(screen.getByTitle('Error log'));
    fireEvent.click(screen.getByTitle('Clear'));

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
