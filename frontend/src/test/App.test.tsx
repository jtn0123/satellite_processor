import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from '../App';

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });

  it('renders dashboard by default', () => {
    const { container } = render(<App />);
    // App has its own router, should render something
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

// JTN-434 ISSUE-033: /browse used to return a 404 even though the sidebar
// label is "Browse & Fetch". It now redirects to the canonical /goes route.
describe('App routing', () => {
  const originalPath = globalThis.location.pathname;
  beforeEach(() => {
    globalThis.history.pushState({}, '', '/browse');
  });
  afterEach(() => {
    globalThis.history.pushState({}, '', originalPath);
  });

  it('/browse redirects to /goes', async () => {
    render(<App />);
    await waitFor(() => {
      expect(globalThis.location.pathname).toBe('/goes');
    });
  });
});
