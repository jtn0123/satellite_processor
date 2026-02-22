/**
 * Shared test utilities for creating Axios-like error objects.
 */

/** Create a mock Axios 404 error for use in tests. */
export function make404() {
  const err = new Error('Not found') as Error & { isAxiosError: boolean; response: { status: number } };
  err.isAxiosError = true;
  err.response = { status: 404 };
  return err;
}
