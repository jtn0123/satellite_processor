import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Layout - mobile drawer', () => {
  it('has mobile menu button', () => {
    render(<Layout />, { wrapper });
    expect(screen.getByLabelText('Open menu')).toBeInTheDocument();
  });

  it('opens drawer when menu button clicked', () => {
    render(<Layout />, { wrapper });
    fireEvent.click(screen.getByLabelText('Open menu'));
    expect(screen.getByLabelText('Navigation menu')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Close menu').length).toBeGreaterThan(0);
  });

  it('closes drawer when close button clicked', () => {
    render(<Layout />, { wrapper });
    fireEvent.click(screen.getByLabelText('Open menu'));
    // The dialog should be open
    const dialog = screen.getByLabelText('Navigation menu');
    expect(dialog).toHaveAttribute('open');
    
    // Click close within the drawer (there are two "Close menu" buttons - overlay + X)
    const closeButtons = screen.getAllByLabelText('Close menu');
    fireEvent.click(closeButtons[closeButtons.length - 1]);
  });

  it('has skip to content link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getByText('Skip to content')).toBeInTheDocument();
  });

  it('has theme toggle with descriptive label', () => {
    render(<Layout />, { wrapper });
    const toggles = screen.getAllByLabelText(/switch to .* theme/i);
    expect(toggles.length).toBeGreaterThan(0);
  });

  it('renders version footer as clickable', () => {
    render(<Layout />, { wrapper });
    const showChangelog = screen.getAllByLabelText('Show changelog');
    expect(showChangelog.length).toBeGreaterThan(0);
  });

  it('renders Live nav link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
  });

  it('renders Animate nav link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('Animate').length).toBeGreaterThan(0);
  });

  it('renders Browse & Fetch nav link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('Browse & Fetch').length).toBeGreaterThan(0);
  });

  it('renders API Docs link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getByText('API Docs')).toBeInTheDocument();
  });

  it('renders Shortcuts button', () => {
    render(<Layout />, { wrapper });
    expect(screen.getByLabelText('Keyboard shortcuts')).toBeInTheDocument();
  });
});
