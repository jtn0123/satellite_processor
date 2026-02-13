import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import TabErrorBoundary from '../components/GoesData/TabErrorBoundary';

function ThrowingChild(): ReactNode {
  throw new Error('Test crash');
}

describe('TabErrorBoundary', () => {
  const originalError = console.error;
  beforeEach(() => { console.error = vi.fn(); });
  afterEach(() => { console.error = originalError; });

  it('renders children when no error', () => {
    render(
      <TabErrorBoundary tabName="Browse">
        <div>Content</div>
      </TabErrorBoundary>
    );
    expect(screen.getByText('Content')).toBeTruthy();
  });

  it('shows error UI when child throws', () => {
    render(
      <TabErrorBoundary tabName="Browse">
        <ThrowingChild />
      </TabErrorBoundary>
    );
    expect(screen.getByText(/Browse encountered an error/)).toBeTruthy();
    expect(screen.getByText('Test crash')).toBeTruthy();
  });

  it('shows retry button', () => {
    render(
      <TabErrorBoundary tabName="Test">
        <ThrowingChild />
      </TabErrorBoundary>
    );
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('uses default tab name when not provided', () => {
    render(
      <TabErrorBoundary>
        <ThrowingChild />
      </TabErrorBoundary>
    );
    expect(screen.getByText(/This tab encountered an error/)).toBeTruthy();
  });
});
