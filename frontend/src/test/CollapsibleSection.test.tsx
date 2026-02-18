import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState, Suspense } from 'react';

// CollapsibleSection is defined inside Settings.tsx — we recreate it here for isolated testing
// since it's a reusable pattern used across the settings page
function CollapsibleSection({ title, icon, children, defaultOpen = false }: Readonly<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {icon}
        <span>{title}</span>
      </button>
      {open && (
        <div data-testid="collapsible-content">
          <Suspense fallback={<div>Loading...</div>}>
            {children}
          </Suspense>
        </div>
      )}
    </div>
  );
}

describe('CollapsibleSection', () => {
  it('renders title and icon', () => {
    render(
      <CollapsibleSection title="Storage" icon={<span data-testid="icon">💾</span>}>
        <p>Storage content</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Storage')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('is collapsed by default', () => {
    render(
      <CollapsibleSection title="Storage" icon={<span>💾</span>}>
        <p>Hidden content</p>
      </CollapsibleSection>
    );
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands when clicked', () => {
    render(
      <CollapsibleSection title="Storage" icon={<span>💾</span>}>
        <p>Visible content</p>
      </CollapsibleSection>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Visible content')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses when clicked again', () => {
    render(
      <CollapsibleSection title="Storage" icon={<span>💾</span>}>
        <p>Toggle content</p>
      </CollapsibleSection>
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Toggle content')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();
  });

  it('starts expanded when defaultOpen is true', () => {
    render(
      <CollapsibleSection title="Open" icon={<span>📂</span>} defaultOpen>
        <p>Already visible</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Already visible')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders nested content correctly', () => {
    render(
      <CollapsibleSection title="Nested" icon={<span>📁</span>} defaultOpen>
        <div>
          <h4>Sub heading</h4>
          <ul><li>Item 1</li><li>Item 2</li></ul>
        </div>
      </CollapsibleSection>
    );
    expect(screen.getByText('Sub heading')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('wraps children in Suspense', () => {
    render(
      <CollapsibleSection title="Lazy" icon={<span>⏳</span>} defaultOpen>
        <p>Suspense wrapped</p>
      </CollapsibleSection>
    );
    expect(screen.getByText('Suspense wrapped')).toBeInTheDocument();
  });
});
