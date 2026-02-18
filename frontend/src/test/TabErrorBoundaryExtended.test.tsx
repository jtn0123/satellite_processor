import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TabErrorBoundary from '../components/GoesData/TabErrorBoundary';

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test crash');
  return <div>Content OK</div>;
}

describe('TabErrorBoundary — extended', () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeAll(() => { console.error = vi.fn(); });
  afterAll(() => { console.error = originalError; });

  it('renders children normally when no error', () => {
    render(
      <TabErrorBoundary tabName="Browse">
        <div>Normal content</div>
      </TabErrorBoundary>
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(
      <TabErrorBoundary tabName="Browse">
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    expect(screen.getByText('Browse encountered an error')).toBeInTheDocument();
    expect(screen.getByText('Test crash')).toBeInTheDocument();
  });

  it('shows default tab name when tabName not provided', () => {
    render(
      <TabErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    expect(screen.getByText('This tab encountered an error')).toBeInTheDocument();
  });

  it('retries and re-renders children on Retry click', () => {
    let shouldThrow = true;
    function Conditional() {
      if (shouldThrow) throw new Error('Retry test');
      return <div>Recovered</div>;
    }

    render(
      <TabErrorBoundary tabName="Test">
        <Conditional />
      </TabErrorBoundary>
    );
    expect(screen.getByText('Test encountered an error')).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });

  it('shows error message in pre block', () => {
    render(
      <TabErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </TabErrorBoundary>
    );
    const pre = screen.getByText('Test crash').closest('pre');
    expect(pre).toBeInTheDocument();
  });
});
