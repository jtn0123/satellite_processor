import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

// Global fetch mock — prevents jsdom/undici "invalid onError method" unhandled rejections
// that occur when components make HTTP requests during tests. This is the default for
// legacy tests that mock the axios `api` client directly; see `./mocks/msw.ts` for
// tests that opt into the MSW-based HTTP interception pattern instead.
const mockFetch = vi.fn(() =>
  Promise.resolve(
    new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
);
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockClear();
});

// Mock IntersectionObserver for components using lazy loading / infinite scroll
// Uses a regular function so it can be called with `new`
function MockIntersectionObserver() {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => []),
  };
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
