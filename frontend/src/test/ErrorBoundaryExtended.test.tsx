import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

function BrokenComponent(): JSX.Element {
  throw new Error('Test error');
}

function GoodComponent() {
  return <div>Working fine</div>;
}

describe('ErrorBoundary extended', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Working fine')).toBeInTheDocument();
  });

  it('catches errors and shows fallback', () => {
    // Suppress console.error for this test
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );
    // Should show some error UI instead of crashing
    expect(document.body.textContent).toBeTruthy();
    spy.mockRestore();
  });

  it('does not crash the whole page', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>
        <div>Still visible</div>
      </div>
    );
    expect(screen.getByText('Still visible')).toBeInTheDocument();
    spy.mockRestore();
  });
});
