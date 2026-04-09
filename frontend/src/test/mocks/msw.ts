/**
 * Per-file MSW helper for tests that want to intercept HTTP at the
 * network layer instead of mocking the axios `api` client directly.
 *
 * Usage (inside a test file):
 *
 *   import { setupMswServer } from './mocks/msw';
 *   const server = setupMswServer();
 *
 *   it('loads frames', () => {
 *     server.use(http.get('*\/api/satellite/frames', () => HttpResponse.json(...)));
 *     // ... render + assert
 *   });
 *
 * The helper scopes server.listen()/close() to a single describe block by
 * calling vitest lifecycle hooks at import time, which keeps MSW off the
 * hot path of the ~220 legacy test files that still mock axios directly.
 * (Starting MSW globally in `setup.ts` was causing libuv stream
 * assertions on Node 24 + happy-dom; opting in per file avoids that.)
 */
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Start a fresh MSW server pre-loaded with the default handlers from
 * `./handlers.ts`. The returned server has lifecycle hooks wired up so
 * it starts before the enclosing test suite runs and resets between
 * tests.
 *
 * The test file should not mock `../api/client` — let requests flow
 * through axios so MSW can intercept them at the XHR layer.
 */
export function setupMswServer() {
  const server = setupServer(...handlers);

  beforeAll(() => {
    server.listen({
      // `warn` (not `error`) so unmocked endpoints log but don't fail —
      // tests can still assert on specific requests without having to
      // register a handler for every incidental call the component
      // makes (e.g. /api/version, /api/status).
      onUnhandledRequest: 'warn',
    });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  return server;
}
