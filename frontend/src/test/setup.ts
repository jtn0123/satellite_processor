import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

// Global fetch mock — prevents jsdom/undici "invalid onError method" unhandled rejections
// that occur when components make HTTP requests during tests.
const mockFetch = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })),
);
vi.stubGlobal('fetch', mockFetch);

afterEach(() => {
  mockFetch.mockClear();
});
