import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/** Create a fresh QueryClient with retry disabled — one per test to avoid shared state. */
function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

/**
 * Render a component wrapped in a fresh QueryClientProvider with retry disabled.
 * This is the default helper for tests that do NOT need a router.
 */
export function renderWithProviders(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/**
 * Render a component wrapped in MemoryRouter → QueryClientProvider.
 * Use this when the component under test requires React Router context.
 */
export function renderWithRouter(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * Render a component wrapped in QueryClientProvider → MemoryRouter with
 * an explicit route path. Use this for page-level components that rely on
 * Routes / useParams.
 *
 * @param routePattern - The route pattern (e.g. "/goes/:id"), defaults to the initialEntry
 * @param initialEntry - The actual URL to navigate to (e.g. "/goes/123"), defaults to path
 */
export function renderWithRoute(
  ui: React.ReactElement,
  path = '/goes',
  { routePattern, initialEntry }: { routePattern?: string; initialEntry?: string } = {},
) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry ?? path]}>
        <Routes>
          <Route path={routePattern ?? path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
