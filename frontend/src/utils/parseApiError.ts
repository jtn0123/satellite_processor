/**
 * Extract a human-readable error message from API error responses.
 *
 * Handles the common response shapes:
 * - { detail: string }
 * - { detail: [{ msg: string }] }  (Pydantic validation)
 * - { message: string }
 * - AxiosError with response.data
 * - Plain Error objects
 */

interface ApiErrorResponse {
  response?: {
    data?: {
      detail?: string | Array<{ msg?: string }>;
      message?: string;
    };
  };
  message?: string;
}

export function parseApiError(err: unknown, fallback = 'An unexpected error occurred'): string {
  if (err == null) return fallback;

  const apiErr = err as ApiErrorResponse;
  const detail = apiErr?.response?.data?.detail;

  if (typeof detail === 'string') {
    return detail.replace(/^Value error, /i, '');
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const msg = detail[0]?.msg;
    if (typeof msg === 'string') {
      return msg.replace(/^Value error, /i, '');
    }
  }

  const message = apiErr?.response?.data?.message;
  if (typeof message === 'string') return message;

  if (err instanceof Error) return err.message;

  if (typeof apiErr?.message === 'string') return apiErr.message;

  return fallback;
}
