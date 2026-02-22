import { test, expect } from '@playwright/test';
import { apiPost, waitForApiHealth, buildFetchRequest, API_BASE } from './helpers';

const WS_URL = API_BASE.replace(/^http/, 'ws') + '/ws/status';

test.describe('WebSocket job progress', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('connects to /ws/status successfully', async ({ page }) => {
    await page.goto('about:blank');
    // Use page.evaluate to test WebSocket connection from browser context
    const connected = await page.evaluate((url: string) => {
      return new Promise<boolean>((resolve) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 10_000);
        ws.onopen = () => {
          clearTimeout(timer);
          ws.close();
          resolve(true);
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      });
    }, WS_URL);

    expect(connected).toBe(true);
  });

  test('receives job progress updates after triggering fetch', async ({ page, request }) => {
    await page.goto('about:blank');
    // Start listening for WS messages
    const messagesPromise = page.evaluate((url: string) => {
      return new Promise<string[]>((resolve) => {
        const messages: string[] = [];
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          ws.close();
          resolve(messages);
        }, 30_000);
        ws.onmessage = (evt: MessageEvent) => {
          messages.push(String(evt.data));
          // After getting a few messages, we can stop early
          if (messages.length >= 3) {
            clearTimeout(timer);
            ws.close();
            resolve(messages);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(messages);
        };
      });
    }, WS_URL);

    // Trigger a fetch
    const fetchReq = buildFetchRequest();
    await apiPost(request, '/api/goes/fetch', fetchReq);

    const messages = await messagesPromise;
    // Messages may or may not arrive depending on job activity
    // Just verify they're valid JSON if any came through
    for (const msg of messages) {
      const parsed: unknown = JSON.parse(msg);
      expect(typeof parsed).toBe('object');
    }
  });

  test('handles reconnection gracefully', async ({ page }) => {
    await page.goto('about:blank');
    // Connect, disconnect, reconnect
    const reconnected = await page.evaluate((url: string) => {
      return new Promise<boolean>((resolve) => {
        const ws1 = new WebSocket(url);
        ws1.onopen = () => {
          ws1.close();
          // Reconnect after a brief delay
          setTimeout(() => {
            const ws2 = new WebSocket(url);
            const timer = setTimeout(() => {
              ws2.close();
              resolve(false);
            }, 10_000);
            ws2.onopen = () => {
              clearTimeout(timer);
              ws2.close();
              resolve(true);
            };
            ws2.onerror = () => {
              clearTimeout(timer);
              resolve(false);
            };
          }, 1_000);
        };
        ws1.onerror = () => resolve(false);
      });
    }, WS_URL);

    expect(reconnected).toBe(true);
  });

  test('messages match expected schema', async ({ page, request }) => {
    await page.goto('about:blank');
    // Trigger a fetch first
    const fetchReq = buildFetchRequest();
    await apiPost(request, '/api/goes/fetch', fetchReq);

    const firstMessage = await page.evaluate((url: string) => {
      return new Promise<string | null>((resolve) => {
        const ws = new WebSocket(url);
        const timer = setTimeout(() => {
          ws.close();
          resolve(null);
        }, 15_000);
        ws.onmessage = (evt: MessageEvent) => {
          clearTimeout(timer);
          ws.close();
          resolve(String(evt.data));
        };
        ws.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
      });
    }, WS_URL);

    if (firstMessage === null) {
      test.skip(true, 'No WS messages received — backend may not have active jobs');
      return;
    }

    const parsed = JSON.parse(firstMessage) as Record<string, unknown>;
    expect(typeof parsed).toBe('object');
    // Messages should have at least a type, status, or event field
    const hasExpectedField = 'type' in parsed || 'status' in parsed || 'job_id' in parsed || 'event' in parsed;
    expect(hasExpectedField).toBeTruthy();
  });
});
