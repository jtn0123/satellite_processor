import { Page } from '@playwright/test';
import { handleApiRoute } from './mock-api';

/**
 * Set up API mocking without intercepting Vite module requests.
 */
export async function setupApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('whatsNewLastSeen', '0.0.0-test');
  });
  // Match only backend API requests (pathname starts with /api/)
  // Exclude Vite source files like /src/api/client.ts
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      return handleApiRoute(route);
    }
    return route.continue();
  });
}
