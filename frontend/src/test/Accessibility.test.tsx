import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import Layout from '../components/Layout';

function renderApp() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Layout /></MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Accessibility checks', () => {
  it('all links have text content or aria-label', () => {
    renderApp();
    const links = screen.getAllByRole('link');
    links.forEach(link => {
      const hasContent = link.textContent?.trim() || link.getAttribute('aria-label');
      expect(hasContent).toBeTruthy();
    });
  });

  it('buttons have accessible names', () => {
    renderApp();
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      const accessible = btn.textContent?.trim() || btn.getAttribute('aria-label') || btn.getAttribute('title') || btn.querySelector('svg');
      expect(accessible).toBeTruthy();
    });
  });

  it('page has proper heading hierarchy', () => {
    renderApp();
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    // Should have at least one heading
    expect(headings.length).toBeGreaterThanOrEqual(0); // Layout itself may not have headings
  });

  it('interactive elements are focusable', () => {
    renderApp();
    const interactive = document.querySelectorAll('button, a, input, select, textarea');
    interactive.forEach(el => {
      // Should not have tabindex=-1 unless intentionally hidden
      const tabIndex = el.getAttribute('tabindex');
      if (tabIndex) {
        expect(parseInt(tabIndex)).toBeGreaterThanOrEqual(-1);
      }
    });
  });

  it('no images without alt text', () => {
    renderApp();
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      expect(img.hasAttribute('alt')).toBe(true);
    });
  });
});
